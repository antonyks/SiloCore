import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173";
const apiURL = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:5001/api";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
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
