import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

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
    redirectPath: "/workspaces/\\d+/chat/home",
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

test.describe("authentication", () => {
  test("loads the login page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "SiloCore" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("redirects logged-out users from protected routes to login", async ({
    page,
  }) => {
    await page.goto("/chat/home");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "SiloCore" })).toBeVisible();
  });

  test("seeded admin logs in and lands on the admin dashboard", async ({
    page,
  }) => {
    await login(page, accounts.admin);
  });

  test("seeded regular user logs in and lands on chat home", async ({
    page,
  }) => {
    await login(page, accounts.user);
  });

  test("admin is redirected away from user-only chat route", async ({
    page,
  }) => {
    await login(page, accounts.admin);

    await page.goto("/chat/home");

    await expect(page).toHaveURL(new RegExp(`${accounts.admin.redirectPath}$`));
    await expect(
      page.getByText(accounts.admin.routeText).first(),
    ).toBeVisible();
  });

  test("regular user is redirected away from admin-only route", async ({
    page,
  }) => {
    await login(page, accounts.user);

    await page.goto("/analytics/dashboard");

    await expect(page).toHaveURL(new RegExp(`${accounts.user.redirectPath}$`));
    await expect(page.getByText(accounts.user.routeText).first()).toBeVisible();
  });
});
