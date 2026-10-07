import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";

export type ManagedChild = { child: ChildProcess; group: boolean };

export function spawnManaged(
  name: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  onOutput: (text: string) => void,
  group = false,
): ManagedChild {
  const managed = {
    child: spawn(name, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      // Setup commands such as npm can launch descendants. Give those commands
      // their own process group so a timeout stops the entire owned tree.
      detached: group && process.platform !== "win32",
    }),
    group,
  };
  managed.child.stdout?.on("data", (chunk: Buffer) =>
    onOutput(chunk.toString()),
  );
  managed.child.stderr?.on("data", (chunk: Buffer) =>
    onOutput(chunk.toString()),
  );
  managed.child.on("error", (error) => onOutput(error.message));
  return managed;
}

function signalOwned(managed: ManagedChild, signal: NodeJS.Signals): void {
  const { child, group } = managed;
  if (!child.pid) return;
  try {
    if (group && process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

export async function runManagedCommand(
  managed: ManagedChild,
  name: string,
  timeoutMs: number,
): Promise<number> {
  const { child } = managed;
  return new Promise<number>((resolve, reject) => {
    let finished = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, code?: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (error) reject(error);
      else resolve(code ?? -1);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        signalOwned(managed, "SIGKILL");
      } catch (error) {
        finish(error as Error);
        return;
      }
      // A process in an uninterruptible state must not trap the fixture forever.
      killTimer = setTimeout(
        () => finish(new Error(`Test command timed out: ${name}`)),
        2_000,
      );
    }, timeoutMs);
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (code !== 0 && managed.group) {
        try {
          signalOwned(managed, "SIGKILL");
        } catch (error) {
          finish(error as Error);
          return;
        }
      }
      if (timedOut) finish(new Error(`Test command timed out: ${name}`));
      else finish(undefined, code ?? -1);
    });
  });
}

export async function stopManaged(
  managed: ManagedChild,
  graceMs = 6_000,
): Promise<void> {
  const { child } = managed;
  if (child.exitCode !== null || child.signalCode !== null || !child.pid)
    return;
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(killTimer);
      clearTimeout(hardTimer);
      if (error) reject(error);
      else resolve();
    };
    const killTimer = setTimeout(() => {
      try {
        signalOwned(managed, "SIGKILL");
      } catch (error) {
        finish(error as Error);
      }
    }, graceMs);
    const hardTimer = setTimeout(
      () => finish(new Error(`Test-owned process ${child.pid} did not exit`)),
      graceMs + 2_000,
    );
    child.once("exit", () => finish());
    child.once("error", (error) => finish(error));
    try {
      signalOwned(managed, "SIGTERM");
    } catch (error) {
      finish(error as Error);
    }
  });
}
