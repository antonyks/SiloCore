import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { expect, test } from "vitest";
import {
  runManagedCommand,
  spawnManaged,
  stopManaged,
} from "../e2e/support/process";

test.skipIf(process.platform === "win32")(
  "a timed-out setup command stops its descendant process",
  async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "silocore-e2e-process-"));
    const output = path.join(directory, "ticks");
    const childPid = path.join(directory, "child-pid");
    const descendant = `setInterval(() => require('node:fs').appendFileSync(${JSON.stringify(output)}, 'x'), 30)`;
    const parent = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(childPid)},String(child.pid));setInterval(()=>{},1000)`;
    const managed = spawnManaged(
      process.execPath,
      ["-e", parent],
      process.cwd(),
      process.env,
      () => undefined,
      true,
    );
    try {
      await expect
        .poll(() => statSync(output, { throwIfNoEntry: false })?.size ?? 0)
        .toBeGreaterThan(0);
      await expect(
        runManagedCommand(managed, "slow setup", 100),
      ).rejects.toThrow("Test command timed out: slow setup");
      expect(managed.child.signalCode).toBe("SIGKILL");
      const size = readFileSync(output).length;
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(readFileSync(output).length).toBe(size);
    } finally {
      try {
        await stopManaged(managed);
      } finally {
        if (existsSync(childPid)) {
          try {
            process.kill(Number(readFileSync(childPid, "utf8")), "SIGKILL");
          } catch {
            /* The process group was already stopped. */
          }
        }
        rmSync(directory, { recursive: true, force: true });
      }
    }
  },
);

test("an owned process that ignores SIGTERM is force-stopped", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "silocore-e2e-stop-"));
  const ready = path.join(directory, "ready");
  const managed = spawnManaged(
    process.execPath,
    [
      "-e",
      `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000)`,
    ],
    process.cwd(),
    process.env,
    () => undefined,
  );
  try {
    await expect.poll(() => existsSync(ready), { timeout: 5_000 }).toBe(true);
    await stopManaged(managed, 50);
    expect(managed.child.signalCode).toBe("SIGKILL");
  } finally {
    try {
      await stopManaged(managed, 50);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}, 10_000);
