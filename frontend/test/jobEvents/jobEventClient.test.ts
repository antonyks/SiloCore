import { afterEach, describe, expect, it, vi } from "vitest";
import { JobEventSubscriptionClient } from "../../src/features/jobEvents/jobEventClient";

function connection() {
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    send(text: string) {
      streamController.enqueue(new TextEncoder().encode(text));
    },
    close() {
      streamController.close();
    },
  };
}

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("JobEventSubscriptionClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shares one stream, reconnects for the filter union, and dispatches only matching jobs", async () => {
    const streams = [connection(), connection(), connection()];
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(streams[0].response)
      .mockResolvedValueOnce(streams[1].response)
      .mockResolvedValueOnce(streams[2].response);
    const client = new JobEventSubscriptionClient({ fetchImpl, getToken: () => "token" });
    const firstJob = vi.fn();
    const secondJob = vi.fn();
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    client.setWorkspaceId(25);
    const unsubscribeFirst = client.register({
      types: ["validation.fixture"], statuses: ["SUCCEEDED"], onJob: firstJob, onReady: firstReady,
    });
    await tick();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstSignal = (fetchImpl.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    const unsubscribeSecond = client.register({
      types: ["chat.session_title"], statuses: ["FAILED"], onJob: secondJob, onReady: secondReady,
    });
    await tick();
    expect(firstSignal.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(secondUrl.searchParams.get("types")).toBe("chat.session_title,validation.fixture");
    expect(secondUrl.searchParams.get("statuses")).toBe("FAILED,SUCCEEDED");
    expect((fetchImpl.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer token", "X-Workspace-Id": "25",
    });

    streams[1].send("event: ready\ndata: {}\n\n");
    streams[1].send('event: job\ndata: {"jobId":1,"type":"validation.fixture","status":"SUCCEEDED"}\n\n');
    streams[1].send('event: job\ndata: {"jobId":2,"type":"chat.session_title","status":"FAILED"}\n\n');
    await tick();
    expect(firstReady).toHaveBeenCalledTimes(1);
    expect(secondReady).toHaveBeenCalledTimes(1);
    expect(firstJob).toHaveBeenCalledExactlyOnceWith({ jobId: 1, type: "validation.fixture", status: "SUCCEEDED" });
    expect(secondJob).toHaveBeenCalledExactlyOnceWith({ jobId: 2, type: "chat.session_title", status: "FAILED" });

    const secondSignal = (fetchImpl.mock.calls[1][1] as RequestInit).signal as AbortSignal;
    unsubscribeSecond();
    await tick();
    expect(secondSignal.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetchImpl.mock.calls[2][0])).searchParams.get("types")).toBe("validation.fixture");
    const thirdSignal = (fetchImpl.mock.calls[2][1] as RequestInit).signal as AbortSignal;
    unsubscribeFirst();
    expect(thirdSignal.aborted).toBe(true);
  });

  it("accepts the backend type-list boundary without disrupting a stream on rejection", async () => {
    const streams = [connection(), connection()];
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(streams[0].response)
      .mockResolvedValueOnce(streams[1].response);
    const client = new JobEventSubscriptionClient({ fetchImpl, getToken: () => "token" });
    const longTypes = Array.from({ length: 15 }, (_, index) => `type${index}-`.padEnd(128, "x"));
    client.setWorkspaceId(25);
    const first = client.register({
      types: longTypes, statuses: ["SUCCEEDED"], onJob: vi.fn(),
    });
    await tick();
    const firstSignal = (fetchImpl.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    expect(() => client.register({
      types: ["final-".padEnd(114, "x")], statuses: ["FAILED"], onJob: vi.fn(),
    })).toThrow("The combined job event types list exceeds 2048 characters.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(firstSignal.aborted).toBe(false);

    const second = client.register({
      types: ["final-".padEnd(113, "x")], statuses: ["FAILED"], onJob: vi.fn(),
    });
    await tick();
    expect(firstSignal.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchImpl.mock.calls[1][0])).searchParams.get("types")?.length).toBe(2048);
    first();
    second();
  });

  it("rejects an oversized union before workspace validation", async () => {
    const stream = connection();
    const fetchImpl = vi.fn().mockResolvedValue(stream.response);
    const client = new JobEventSubscriptionClient({ fetchImpl, getToken: () => "token" });
    const longTypes = Array.from({ length: 15 }, (_, index) => `type${index}-`.padEnd(128, "x"));
    const first = client.register({
      types: longTypes, statuses: ["SUCCEEDED"], onJob: vi.fn(),
    });
    expect(() => client.register({
      types: ["final-".padEnd(114, "x")], statuses: ["FAILED"], onJob: vi.fn(),
    })).toThrow("The combined job event types list exceeds 2048 characters.");
    expect(fetchImpl).not.toHaveBeenCalled();

    client.setWorkspaceId(25);
    await tick();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get("types")?.length).toBe(1920 + 14);
    first();
  });

  it("handles fragmented frames, ignores malformed data, and readies a late registration", async () => {
    const stream = connection();
    const fetchImpl = vi.fn().mockResolvedValue(stream.response);
    const client = new JobEventSubscriptionClient({ fetchImpl, getToken: () => "token" });
    const firstJob = vi.fn(() => { throw new Error("feature failure"); });
    const secondJob = vi.fn();
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    client.setWorkspaceId(25);
    const first = client.register({
      types: ["validation.fixture"], statuses: ["SUCCEEDED"], onJob: firstJob, onReady: firstReady,
    });
    await tick();
    stream.send(": keep-alive\r\n\r\nevent: rea");
    stream.send("dy\r\ndata: {}\r\n\r\nevent: job\r\ndata: {\"jobId\":5,\"type\":\"validation.fixture\",\"status\":\"SUCCEEDED\"}\r\n\r\n");
    stream.send('event: job\ndata: {"jobId":"invalid"}\n\nevent: job\ndata: {"jobId":6,"type":"validation.fixture","status":"SUCCEEDED"}\n\n');
    await tick();
    expect(firstReady).toHaveBeenCalledTimes(1);
    expect(firstJob).toHaveBeenCalledTimes(2);

    const second = client.register({
      types: ["validation.fixture"], statuses: ["SUCCEEDED"], onJob: secondJob, onReady: secondReady,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(secondReady).toHaveBeenCalledTimes(1);
    stream.send('event: job\ndata: {"jobId":7,"type":"validation.fixture","status":"SUCCEEDED","private":"ignored"}\n\n');
    await tick();
    expect(secondJob).toHaveBeenCalledWith({ jobId: 7, type: "validation.fixture", status: "SUCCEEDED" });
    first();
    second();
  });

  it("reconnects ended streams with bounded backoff and calls ready again", async () => {
    vi.useFakeTimers();
    const streams = [connection(), connection(), connection()];
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(streams[0].response)
      .mockResolvedValueOnce(streams[1].response)
      .mockResolvedValueOnce(streams[2].response);
    const client = new JobEventSubscriptionClient({ fetchImpl, getToken: () => "token" });
    const onReady = vi.fn();
    client.setWorkspaceId(25);
    const unsubscribe = client.register({
      types: ["validation.fixture"], statuses: ["SUCCEEDED"], onJob: vi.fn(), onReady,
    });
    await tick();
    streams[0].send("event: ready\ndata: {}\n\n");
    streams[0].close();
    await tick();
    expect(onReady).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    streams[1].send("event: ready\ndata: {}\n\n");
    streams[1].close();
    await tick();
    expect(onReady).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it("stops on authentication failure and uses the existing logout path", async () => {
    vi.useFakeTimers();
    localStorage.setItem("SiloCoreToken", "expired-token");
    localStorage.setItem("SiloCoreUser", JSON.stringify({ id: 1 }));
    const unauthorized = vi.fn();
    window.addEventListener("unauthorized-access", unauthorized);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const client = new JobEventSubscriptionClient({ fetchImpl });
    client.setWorkspaceId(25);
    const unsubscribe = client.register({
      types: ["validation.fixture"], statuses: ["SUCCEEDED"], onJob: vi.fn(),
    });
    await tick();
    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("SiloCoreToken")).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.removeEventListener("unauthorized-access", unauthorized);
  });

  it("reconnects with a newer token after an old request receives 401", async () => {
    let token = "old-token";
    let resolveOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const stream = connection();
    const fetchImpl = vi.fn()
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce(stream.response);
    const onUnauthorized = vi.fn();
    const onReady = vi.fn();
    const client = new JobEventSubscriptionClient({
      fetchImpl,
      getToken: () => token,
      onUnauthorized,
    });
    client.setWorkspaceId(25);
    const unsubscribe = client.register({
      types: ["validation.fixture"], statuses: ["SUCCEEDED"], onJob: vi.fn(), onReady,
    });
    const oldSignal = (fetchImpl.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    token = "new-token";
    resolveOld(new Response(null, { status: 401 }));
    await tick();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(oldSignal.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer new-token",
    });
    stream.send("event: ready\ndata: {}\n\n");
    await tick();
    expect(onReady).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not retry a rejected filter set until registrations change", async () => {
    vi.useFakeTimers();
    const stream = connection();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(stream.response);
    const client = new JobEventSubscriptionClient({ fetchImpl, getToken: () => "token" });
    client.setWorkspaceId(25);
    const first = client.register({
      types: ["validation.fixture"], statuses: ["SUCCEEDED"], onJob: vi.fn(),
    });
    await tick();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const second = client.register({
      types: ["another.fixture"], statuses: ["FAILED"], onJob: vi.fn(),
    });
    await tick();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    first();
    second();
  });

  it("aborts the old workspace and ignores a late response", async () => {
    let resolveOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const currentStream = connection();
    const fetchImpl = vi.fn()
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce(currentStream.response);
    const client = new JobEventSubscriptionClient({ fetchImpl, getToken: () => "token" });
    const onJob = vi.fn();
    client.setWorkspaceId(25);
    const unsubscribe = client.register({
      types: ["validation.fixture"], statuses: ["SUCCEEDED"], onJob,
    });
    const oldSignal = (fetchImpl.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    client.setWorkspaceId(30);
    await tick();
    expect(oldSignal.aborted).toBe(true);
    expect((fetchImpl.mock.calls[1][1] as RequestInit).headers).toMatchObject({ "X-Workspace-Id": "30" });
    resolveOld(connection().response);
    await tick();
    currentStream.send('event: job\ndata: {"jobId":8,"type":"validation.fixture","status":"SUCCEEDED"}\n\n');
    await tick();
    expect(onJob).toHaveBeenCalledExactlyOnceWith({ jobId: 8, type: "validation.fixture", status: "SUCCEEDED" });
    unsubscribe();
  });
});
