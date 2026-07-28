import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173";
const apiURL = process.env.PLAYWRIGHT_API_URL || "http://localhost:5000/api";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  metadata: {
    apiURL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
