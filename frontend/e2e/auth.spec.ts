import { expect, request, test, type Page } from "@playwright/test";
import process from "node:process";

const API_URL = process.env.PLAYWRIGHT_API_URL || "http://localhost:5000/api";

const accounts = {
  admin: {
    email: "admin@example.com",
    password: "Admin123!",
    redirectPath: "/analytics/dashboard",
    routeText: "Dashboard / Stats",
  },
  user: {
    email: "user@example.com",
    password: "User123!",
    redirectPath: "/chat/home",
    routeText: "New Chat",
  },
} as const;

const login = async (
  page: Page,
  account: (typeof accounts)[keyof typeof accounts],
) => {
  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(account.email);
  await page.getByPlaceholder("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${account.redirectPath}$`));
  await expect(page.getByText(account.routeText).first()).toBeVisible();
};

test.beforeAll(async () => {
  const apiContext = await request.newContext();

  try {
    const healthURL = `${API_URL.replace(/\/api\/?$/, "")}/health`;
    const response = await apiContext.get(healthURL);
    expect(response.ok(), `Backend health check failed at ${healthURL}`).toBeTruthy();
  } finally {
    await apiContext.dispose();
  }
});

test.describe("authentication", () => {
  test("loads the login page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "SiloCore" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("seeded admin logs in and lands on the admin dashboard", async ({ page }) => {
    await login(page, accounts.admin);
  });

  test("seeded regular user logs in and lands on chat home", async ({ page }) => {
    await login(page, accounts.user);
  });

  test("admin is redirected away from user-only chat route", async ({ page }) => {
    await login(page, accounts.admin);

    await page.goto("/chat/home");

    await expect(page).toHaveURL(new RegExp(`${accounts.admin.redirectPath}$`));
    await expect(page.getByText(accounts.admin.routeText).first()).toBeVisible();
  });

  test("regular user is redirected away from admin-only route", async ({ page }) => {
    await login(page, accounts.user);

    await page.goto("/analytics/dashboard");

    await expect(page).toHaveURL(new RegExp(`${accounts.user.redirectPath}$`));
    await expect(page.getByText(accounts.user.routeText).first()).toBeVisible();
  });
});
