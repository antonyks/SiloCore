import {
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import type { PrismaClient } from "../../../backend/node_modules/@prisma/client";
import {
  runManagedCommand,
  spawnManaged,
  stopManaged,
  type ManagedChild,
} from "./process";
import { startUpstreams } from "./upstreams";

export type Actor = {
  token: string;
  user: {
    id: number;
    role: string;
    personalWorkspace: { id: number; name: string };
  };
};
export type PublicJob = {
  id: number;
  workspaceId: number;
  status: string;
  progress: number;
  stage: string | null;
  result: { checksum?: string; iterations?: number } | null;
};
const root = path.resolve(import.meta.dirname, "../../..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const password = "E2eSynthetic123!";
export const syntheticPassword = password;
export async function waitUntil(
  check: () => Promise<boolean>,
  label: string,
  timeout = 30_000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function localUrl(value: string | undefined, fallback: string) {
  const url = new URL(value || fallback);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("E2E only supports test-owned local HTTP services");
  return url;
}
async function ensurePortFree(port: number) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) =>
      reject(
        new Error(
          `E2E port ${port} cannot be bound (${error.code}); unrelated services will not be reused or stopped`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
export async function startStack() {
  const setupDeadline = Date.now() + 7 * 60_000;
  const id = randomUUID().replaceAll("-", "");
  const container = `silocore-e2e-${id}`;
  const database = `silocore_e2e_test_${id}`;
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:55432/${database}`;
  const apiUrl = localUrl(
    process.env.PLAYWRIGHT_API_URL,
    "http://127.0.0.1:5001/api",
  );
  const frontendUrl = localUrl(
    process.env.PLAYWRIGHT_BASE_URL,
    "http://127.0.0.1:5173",
  );
  if (apiUrl.pathname !== "/api" || frontendUrl.pathname !== "/")
    throw new Error("E2E URLs must use /api and / respectively");
  const children: ManagedChild[] = [];
  const logs: string[] = [];
  let containerOwned = false;
  let containerAttempted = false;
  let upstream: Awaited<ReturnType<typeof startUpstreams>> | undefined;
  let prisma: PrismaClient | undefined;
  let worker: ManagedChild | undefined;
  let apiRequests: APIRequestContext | undefined;
  const secrets = [
    databaseUrl,
    password,
    "e2e-only-signing-secret",
    "e2e-only-provider-key",
    "synthetic-header",
    "Admin123!",
    "User123!",
  ];
  const sanitize = (text: string) => {
    for (const secret of secrets) text = text.replaceAll(secret, "[REDACTED]");
    return text
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
      .replace(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        "[REDACTED JWT]",
      );
  };
  const remaining = (deadline: number, label: string) => {
    const milliseconds = deadline - Date.now();
    if (milliseconds <= 0) throw new Error(`Timed out during ${label}`);
    return milliseconds;
  };
  const launch = (
    command: string,
    args: string[],
    cwd = backend,
    env: NodeJS.ProcessEnv = process.env,
    group = false,
  ) => {
    const managed = spawnManaged(
      command,
      args,
      cwd,
      env,
      (output) => {
        logs.push(sanitize(output));
        if (logs.length > 500) logs.shift();
      },
      group,
    );
    children.push(managed);
    return managed;
  };
  const command = async (
    name: string,
    args: string[],
    cwd = backend,
    env: NodeJS.ProcessEnv = process.env,
    deadline = setupDeadline,
    limitMs = 120_000,
    allowNonzero = false,
  ) => {
    const timeoutMs = Math.min(limitMs, remaining(deadline, name));
    const managed = launch(name, args, cwd, env, true);
    const code = await runManagedCommand(managed, name, timeoutMs);
    if (code !== 0 && !allowNonzero)
      throw new Error(
        `Test setup command failed: ${name} (${code})\n${logs.slice(-20).join("")}`,
      );
    return code === 0;
  };
  const bounded = async (
    operation: () => Promise<unknown>,
    deadline: number,
    label: string,
  ) => {
    const timeoutMs = Math.min(5_000, remaining(deadline, label));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Timed out during ${label}`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const close = async (deadline = Date.now() + 120_000) => {
    const errors: unknown[] = [];
    for (const child of [...children].reverse()) {
      try {
        await stopManaged(child);
      } catch (error) {
        errors.push(error);
      }
    }
    for (const resource of [
      () => apiRequests?.dispose(),
      () => prisma?.$disconnect(),
      () => upstream?.close(),
    ]) {
      try {
        await bounded(async () => resource(), deadline, "E2E resource cleanup");
      } catch (error) {
        errors.push(error);
      }
    }
    if (containerAttempted && !containerOwned) {
      // A timed-out Docker run may have created the container. Check ownership.
      try {
        const inspected = await promisify(execFile)(
          "docker",
          [
            "inspect",
            "--format",
            '{{index .Config.Labels "silocore.e2e.owner"}}',
            container,
          ],
          {
            timeout: Math.min(
              5_000,
              remaining(deadline, "Docker ownership check"),
            ),
          },
        );
        containerOwned = inspected.stdout.trim() === id;
      } catch (error) {
        if (!String(error).includes("No such object")) errors.push(error);
      }
    }
    if (containerOwned) {
      try {
        await command(
          "docker",
          ["rm", "-f", container],
          backend,
          process.env,
          deadline,
          30_000,
        );
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "E2E teardown failed");
  };
  try {
    await ensurePortFree(55432);
    await ensurePortFree(Number(apiUrl.port || 80));
    await ensurePortFree(Number(frontendUrl.port || 80));
    upstream = await startUpstreams();
    const env = {
      ...process.env,
      PATH: `${path.join(backend, "node_modules/.bin")}${path.delimiter}${process.env.PATH || ""}`,
      DATABASE_URL: databaseUrl,
      JWT_SECRET: "e2e-only-signing-secret",
      OLLAMA_MODEL: "e2e-ollama",
      OLLAMA_HOST: upstream.baseUrl,
      PORT: apiUrl.port,
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      WORKER_CONCURRENCY: "1",
      PISCINA_THREAD_COUNT: "1",
      WORKER_SHUTDOWN_GRACE_MS: "5000",
      WORKER_JOB_HEARTBEAT_INTERVAL_MS: "1000",
      WORKER_STALE_JOB_MS: "300000",
      PROVIDER_HEALTH_SAMPLE_INTERVAL_MS: "300000",
      PROVIDER_HEALTH_SAMPLE_RECENT_MS: "900000",
      PGBOSS_SCHEMA: "pgboss",
    };
    containerAttempted = true;
    await command("docker", [
      "run",
      "--detach",
      "--name",
      container,
      "--label",
      `silocore.e2e.owner=${id}`,
      "-p",
      "127.0.0.1:55432:5432",
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "-e",
      `POSTGRES_DB=${database}`,
      "postgres:16",
    ]);
    containerOwned = true;
    const pgDeadline = Math.min(Date.now() + 30_000, setupDeadline);
    await waitUntil(
      async () => {
        try {
          return await command(
            "docker",
            ["exec", container, "pg_isready", "-U", "postgres", "-d", database],
            backend,
            process.env,
            pgDeadline,
            2_000,
            true,
          );
        } catch {
          return false;
        }
      },
      "disposable PostgreSQL",
      remaining(pgDeadline, "disposable PostgreSQL"),
    );
    await command("npm", ["run", "build"], backend, env);
    await command(
      path.join(backend, "node_modules/.bin/prisma"),
      ["migrate", "deploy"],
      backend,
      env,
    );
    await command(
      path.join(backend, "node_modules/.bin/prisma"),
      ["db", "seed"],
      backend,
      env,
    );
    const require = createRequire(path.join(backend, "package.json"));
    const { PrismaClient: Client } = require("@prisma/client") as {
      PrismaClient: new (options: unknown) => PrismaClient;
    };
    prisma = new Client({ datasources: { db: { url: databaseUrl } } });
    launch(process.execPath, ["dist/server.js"], backend, env);
    await waitUntil(
      async () => {
        try {
          return (
            await fetch(`${apiUrl.origin}/health`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok;
        } catch {
          return false;
        }
      },
      "API",
      Math.min(30_000, remaining(setupDeadline, "API")),
    );
    apiRequests = await playwrightRequest.newContext({ timeout: 10_000 });
    const request = async (
      actor: Actor,
      workspaceId: number,
      endpoint: string,
      method = "GET",
      body?: unknown,
      timeout = 10_000,
    ) =>
      apiRequests!.fetch(`${apiUrl.href}${endpoint}`, {
        method,
        timeout,
        headers: {
          Authorization: `Bearer ${actor.token}`,
          "X-Workspace-Id": String(workspaceId),
        },
        data: body,
      });
    const login = async (
      email: string,
      actorPassword = password,
    ): Promise<Actor> => {
      const response = await fetch(`${apiUrl.href}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: actorPassword }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`Synthetic login failed: ${response.status}`);
      // Login is the sole source of identity tokens; never manufacture JWTs in tests.
      return (await response.json()).data;
    };
    const admin = await login("admin@example.com", "Admin123!");
    const adminWorkspace = admin.user.personalWorkspace.id;
    const providers: Record<"ollama" | "openai", { id: number }> = {} as Record<
      "ollama" | "openai",
      { id: number }
    >;
    for (const provider of ["ollama", "openai"] as const) {
      const response = await request(
        admin,
        adminWorkspace,
        "/admin/llm/providers",
        "POST",
        {
          name: `E2E ${provider}`,
          type: provider === "ollama" ? "ollama" : "openai-compatible",
          baseUrl: upstream.baseUrl,
          defaultModel: `e2e-${provider}`,
          enabled: true,
          apiKey: "e2e-only-provider-key",
          extraHeaders: { "X-E2E-Secret": "synthetic-header" },
        },
      );
      if (response.status() !== 201)
        throw new Error(
          `Provider fixture creation failed: ${response.status()}`,
        );
      providers[provider] = (await response.json()).data;
    }
    launch(
      process.execPath,
      [
        path.join(frontend, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        frontendUrl.port,
        "--strictPort",
      ],
      frontend,
      { ...env, VITE_API_URL: apiUrl.href },
    );
    await waitUntil(
      async () => {
        try {
          return (
            await fetch(frontendUrl.href, { signal: AbortSignal.timeout(1000) })
          ).ok;
        } catch {
          return false;
        }
      },
      "frontend",
      Math.min(30_000, remaining(setupDeadline, "frontend")),
    );
    remaining(setupDeadline, "managed E2E setup");
    const upstreams = upstream;
    const db = prisma;
    const users: number[] = [];
    const workspaces: { actor: Actor; id: number }[] = [];
    const chats: { actor: Actor; workspace: number; id: number }[] = [];
    return {
      frontendUrl: frontendUrl.origin,
      apiUrl: apiUrl.href,
      admin,
      providers,
      upstreams,
      db,
      request,
      login,
      trackWorkspace(actor: Actor, id: number) {
        workspaces.push({ actor, id });
      },
      trackChat(actor: Actor, workspace: number, id: number) {
        chats.push({ actor, workspace, id });
      },
      async createUser() {
        const email = `e2e-${randomUUID()}@example.com`;
        const response = await request(
          admin,
          adminWorkspace,
          "/users",
          "POST",
          { name: "Synthetic E2E User", email, password },
        );
        if (response.status() !== 201)
          throw new Error(`User fixture creation failed: ${response.status()}`);
        users.push((await response.json()).data.id);
        return { email, actor: await login(email) };
      },
      async startWorker() {
        if (worker) throw new Error("Worker already started");
        const offset = logs.length;
        worker = launch(process.execPath, ["dist/worker.js"], backend, env);
        await waitUntil(
          async () =>
            logs
              .slice(offset)
              .join("")
              .includes("Worker started with job lifecycle"),
          "worker readiness",
        );
      },
      diagnostics: () => logs.join(""),
      async close() {
        const deadline = Date.now() + 120_000;
        const cleanupErrors: unknown[] = [];
        if (worker) {
          try {
            await stopManaged(worker);
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        const remove = async (
          actor: Actor,
          workspace: number,
          endpoint: string,
        ) => {
          if (Date.now() >= deadline - 70_000) return;
          try {
            const response = await request(
              actor,
              workspace,
              endpoint,
              "DELETE",
              undefined,
              Math.min(
                2_000,
                remaining(deadline - 70_000, "API fixture cleanup"),
              ),
            );
            if (!response.ok())
              throw new Error(
                `Fixture cleanup failed (${response.status()}): ${endpoint}`,
              );
          } catch (error) {
            cleanupErrors.push(error);
          }
        };
        for (const chat of chats)
          await remove(chat.actor, chat.workspace, `/chat/${chat.id}`);
        for (const workspace of workspaces)
          await remove(
            workspace.actor,
            workspace.actor.user.personalWorkspace.id,
            `/workspaces/${workspace.id}`,
          );
        for (const provider of Object.values(providers))
          await remove(
            admin,
            adminWorkspace,
            `/admin/llm/providers/${provider.id}`,
          );
        for (const user of users)
          await remove(admin, adminWorkspace, `/users/${user}`);
        try {
          await close(deadline);
        } catch (error) {
          cleanupErrors.push(error);
        }
        if (cleanupErrors.length)
          throw new AggregateError(cleanupErrors, "E2E cleanup failed");
      },
    };
  } catch (error) {
    await close().catch((cleanup: unknown) => {
      const failures =
        cleanup instanceof AggregateError ? cleanup.errors : [cleanup];
      logs.push(...failures.map((failure) => sanitize(String(failure))));
    });
    throw new Error(
      `Managed E2E setup failed: ${sanitize(String(error))}\n${logs.slice(-25).join("")}`,
    );
  }
}
export type TestStack = Awaited<ReturnType<typeof startStack>>;
