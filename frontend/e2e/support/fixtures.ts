/* eslint-disable no-empty-pattern -- Playwright requires destructured fixture dependencies. */
import { test as base, expect } from "@playwright/test";
import { startStack, type TestStack } from "./stack";
export const test = base.extend<{ diagnostics: void }, { stack: TestStack }>({
  stack: [
    async ({}, provide) => {
      const stack = await startStack();
      try {
        await provide(stack);
      } finally {
        await stack.close();
      }
    },
    // Setup has a seven-minute deadline and teardown reserves two minutes.
    { scope: "worker", auto: true, timeout: 10 * 60_000 },
  ],
  baseURL: async ({ stack }, provide) => provide(stack.frontendUrl),
  diagnostics: [
    async ({ stack }, provide, info) => {
      await provide();
      if (info.status !== info.expectedStatus)
        await info.attach("sanitized-service-diagnostics", {
          body: stack.diagnostics(),
          contentType: "text/plain",
        });
    },
    { auto: true },
  ],
});
export { expect };
