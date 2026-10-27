import { API_BASE_URL } from "../../config/constants";
import { logoutAndRedirect } from "../../lib/navigation";
import { storage } from "../../lib/storage";

export const JOB_STATUSES = [
  "QUEUED",
  "RUNNING",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "SUCCEEDED",
  "FAILED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobStatusEvent {
  jobId: number;
  type: string;
  status: JobStatus;
}

export interface JobEventRegistration {
  types: readonly string[];
  statuses: readonly JobStatus[];
  onJob: (event: JobStatusEvent) => void;
  onReady?: () => void;
}

interface StoredRegistration extends JobEventRegistration {
  types: readonly string[];
  statuses: readonly JobStatus[];
}

interface JobEventClientDependencies {
  fetchImpl?: typeof fetch;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
}

const STATUS_SET = new Set<string>(JOB_STATUSES);
const MAX_TYPES = 16;
const MAX_TYPE_LENGTH = 128;
const MAX_TYPES_LIST_LENGTH = 2048;
const MAX_FRAME_LENGTH = 64 * 1024;
const HEALTHY_CONNECTION_MS = 30_000;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15_000] as const;

function normalizeTypes(types: readonly string[]): string[] {
  if (types.length === 0 || types.length > MAX_TYPES || types.some((type) =>
    typeof type !== "string" ||
    type.length === 0 ||
    type.length > MAX_TYPE_LENGTH ||
    type.trim().length === 0 ||
    type.includes(",") ||
    type === "*" ||
    [...type].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )) {
    throw new Error("Job event types must be exact, nonempty names of at most 128 characters.");
  }
  return [...new Set(types)].sort();
}

function normalizeStatuses(statuses: readonly JobStatus[]): JobStatus[] {
  if (statuses.length === 0 || statuses.length > JOB_STATUSES.length || statuses.some((status) => !STATUS_SET.has(status))) {
    throw new Error("Job event statuses must be durable job status values.");
  }
  return [...new Set(statuses)].sort();
}

function parseJobEvent(dataLines: string[]): JobStatusEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.jobId !== "number" ||
    !Number.isSafeInteger(candidate.jobId) ||
    candidate.jobId <= 0 ||
    typeof candidate.type !== "string" ||
    candidate.type.length === 0 ||
    typeof candidate.status !== "string" ||
    !STATUS_SET.has(candidate.status)
  ) {
    return null;
  }
  return {
    jobId: candidate.jobId,
    type: candidate.type,
    status: candidate.status as JobStatus,
  };
}

export class JobEventSubscriptionClient {
  private readonly dependencies: JobEventClientDependencies;
  private readonly registrations = new Map<number, StoredRegistration>();
  private nextRegistrationId = 1;
  private workspaceId: number | null = null;
  private activeKey: string | null = null;
  private controller: AbortController | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private retryCount = 0;
  private ready = false;
  private blocked = false;
  private authFailed = false;

  constructor(dependencies: JobEventClientDependencies = {}) {
    this.dependencies = dependencies;
  }

  setWorkspaceId(workspaceId: number | null): void {
    const nextId = workspaceId !== null && Number.isSafeInteger(workspaceId) && workspaceId > 0
      ? workspaceId
      : null;
    if (this.workspaceId === nextId) return;
    this.stop();
    this.workspaceId = nextId;
    this.retryCount = 0;
    this.blocked = false;
    this.reconcile();
  }

  register(registration: JobEventRegistration): () => void {
    const stored: StoredRegistration = {
      ...registration,
      types: normalizeTypes(registration.types),
      statuses: normalizeStatuses(registration.statuses),
    };
    this.getFilters(stored);
    const id = this.nextRegistrationId++;
    const wasReady = this.ready;
    const previousKey = this.activeKey;
    this.registrations.set(id, stored);
    try {
      this.reconcile();
    } catch (error) {
      this.registrations.delete(id);
      throw error;
    }
    if (wasReady && this.activeKey === previousKey) this.callSafely(stored.onReady);

    return () => {
      if (!this.registrations.delete(id)) return;
      this.reconcile();
    };
  }

  private reconcile(): void {
    if (this.workspaceId === null || this.registrations.size === 0 || this.authFailed) {
      this.stop();
      return;
    }
    const { types, statuses } = this.getFilters();
    const key = JSON.stringify([this.workspaceId, types, statuses]);
    if (key === this.activeKey && (this.controller || this.retryTimer || this.blocked)) return;
    this.stop();
    this.activeKey = key;
    this.retryCount = 0;
    this.blocked = false;
    this.connect(this.workspaceId, types, statuses);
  }

  private getFilters(additional?: StoredRegistration): { types: string[]; statuses: JobStatus[] } {
    const registrations = [...this.registrations.values()];
    if (additional) registrations.push(additional);
    const types = [...new Set(registrations.flatMap((entry) => entry.types))].sort();
    const statuses = [...new Set(registrations.flatMap((entry) => entry.statuses))].sort();
    if (types.length > MAX_TYPES) throw new Error("Too many job event types are registered.");
    if (types.join(",").length > MAX_TYPES_LIST_LENGTH) {
      throw new Error("The combined job event types list exceeds 2048 characters.");
    }
    return { types, statuses };
  }

  private stop(): void {
    this.generation += 1;
    this.ready = false;
    this.activeKey = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.controller?.abort();
    this.controller = null;
    if (this.reader) void this.reader.cancel().catch(() => undefined);
    this.reader = null;
  }

  private connect(workspaceId: number, types: string[], statuses: JobStatus[]): void {
    const token = (this.dependencies.getToken ?? storage.getToken)();
    if (!token) {
      this.failAuthentication();
      return;
    }
    const controller = new AbortController();
    const generation = ++this.generation;
    const startedAt = Date.now();
    this.controller = controller;
    const query = new URLSearchParams({ types: types.join(","), statuses: statuses.join(",") });
    const fetchImpl = this.dependencies.fetchImpl ?? fetch;

    void (async () => {
      try {
        const response = await fetchImpl(`${API_BASE_URL}/jobs/events?${query}`, {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
            "X-Workspace-Id": String(workspaceId),
          },
          signal: controller.signal,
        });
        if (!this.isCurrent(generation, controller)) return;
        if (response.status === 401) {
          const currentToken = (this.dependencies.getToken ?? storage.getToken)();
          if (currentToken && currentToken !== token) {
            this.stop();
            this.reconcile();
            return;
          }
          this.failAuthentication();
          return;
        }
        if (!response.ok && response.status >= 400 && response.status < 500 &&
          response.status !== 408 && response.status !== 429) {
          this.controller = null;
          this.blocked = true;
          return;
        }
        if (!response.ok || !response.body) throw new Error("Job event stream unavailable.");
        await this.readStream(response.body, generation, controller);
      } catch {
        // A network or stream failure is retried below unless the request was stopped.
      }
      if (!this.isCurrent(generation, controller)) return;
      this.controller = null;
      this.reader = null;
      this.ready = false;
      if (Date.now() - startedAt >= HEALTHY_CONNECTION_MS) this.retryCount = 0;
      const delay = RETRY_DELAYS_MS[Math.min(this.retryCount, RETRY_DELAYS_MS.length - 1)];
      this.retryCount += 1;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.activeKey && this.workspaceId === workspaceId && !this.authFailed) {
          this.connect(workspaceId, types, statuses);
        }
      }, delay);
    })();
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    generation: number,
    controller: AbortController,
  ): Promise<void> {
    const reader = body.getReader();
    this.reader = reader;
    const decoder = new TextDecoder();
    let lineBuffer = "";
    let frameLines: string[] = [];
    let frameLength = 0;

    const processLine = (line: string) => {
      if (line === "") {
        if (frameLines.length > 0) this.dispatchFrame(frameLines, generation, controller);
        frameLines = [];
        frameLength = 0;
      } else {
        frameLength += line.length;
        if (frameLength > MAX_FRAME_LENGTH) throw new Error("Job event frame exceeds its limit.");
        frameLines.push(line);
      }
    };
    const processText = (text: string) => {
      lineBuffer += text;
      let newline = lineBuffer.indexOf("\n");
      while (newline !== -1) {
        const line = lineBuffer.slice(0, newline).replace(/\r$/, "");
        lineBuffer = lineBuffer.slice(newline + 1);
        processLine(line);
        newline = lineBuffer.indexOf("\n");
      }
      if (lineBuffer.length > MAX_FRAME_LENGTH) throw new Error("Job event line exceeds its limit.");
    };

    try {
      while (this.isCurrent(generation, controller)) {
        const { done, value } = await reader.read();
        if (done) break;
        processText(decoder.decode(value, { stream: true }));
      }
      processText(decoder.decode());
      if (lineBuffer) processLine(lineBuffer.replace(/\r$/, ""));
      if (frameLines.length > 0) this.dispatchFrame(frameLines, generation, controller);
    } finally {
      if (this.reader === reader) this.reader = null;
      if (!controller.signal.aborted) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  private dispatchFrame(lines: string[], generation: number, controller: AbortController): void {
    if (!this.isCurrent(generation, controller)) return;
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) {
        const value = line.slice(5);
        dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
      }
    }
    if (eventName === "ready") {
      this.ready = true;
      for (const registration of this.registrations.values()) this.callSafely(registration.onReady);
      return;
    }
    if (eventName !== "job") return;
    const event = parseJobEvent(dataLines);
    if (!event) return;
    for (const registration of this.registrations.values()) {
      if (registration.types.includes(event.type) && registration.statuses.includes(event.status)) {
        this.callSafely(() => registration.onJob(event));
      }
    }
  }

  private isCurrent(generation: number, controller: AbortController): boolean {
    return generation === this.generation && this.controller === controller && !controller.signal.aborted;
  }

  private failAuthentication(): void {
    if (this.authFailed) return;
    this.authFailed = true;
    this.stop();
    (this.dependencies.onUnauthorized ?? logoutAndRedirect)();
  }

  private callSafely(callback: (() => void) | undefined): void {
    try {
      callback?.();
    } catch {
      // A feature callback cannot interrupt the shared stream or other subscribers.
    }
  }
}
