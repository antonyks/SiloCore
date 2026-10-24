import { expect, test } from "./support/fixtures";

test("access actions require centered confirmation dialogs", async ({ page, stack }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Admin123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\/dashboard$/);

  const user = {
    id: 101,
    name: "Synthetic Access User",
    email: "synthetic-access@example.com",
    role: "USER",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  let accessRequests = 0;
  await page.route(`${stack.apiUrl}/users**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET" && pathname.endsWith("/users")) {
      await route.fulfill({ json: { data: user.status === "DELETED" ? [] : [user], total: user.status === "DELETED" ? 0 : 1 } });
      return;
    }
    if (route.request().method() === "POST" && pathname.endsWith("/ban/101")) {
      accessRequests += 1;
      user.status = "BANNED";
      await route.fulfill({ json: { data: user } });
      return;
    }
    if (route.request().method() === "POST" && pathname.endsWith("/activate/101")) {
      accessRequests += 1;
      user.status = "ACTIVE";
      await route.fulfill({ json: { data: user } });
      return;
    }
    if (route.request().method() === "DELETE" && pathname.endsWith("/users/101")) {
      accessRequests += 1;
      user.status = "DELETED";
      await route.fulfill({ json: { data: user } });
      return;
    }
    await route.continue();
  });
  await page.goto("/admin/users/access");

  const row = page.getByRole("row", { name: /Synthetic Access User/ });
  const banButton = row.getByRole("button", { name: "Ban" });
  await banButton.click();
  const banDialog = page.getByRole("dialog", { name: "Ban user Synthetic Access User" });
  await expect(banDialog).toBeInViewport();
  await expect(banDialog.getByText("synthetic-access@example.com")).toBeVisible();
  const sidebar = await page.locator("aside").boundingBox();
  const banBox = await banDialog.boundingBox();
  const viewportWidth = page.viewportSize()!.width;
  expect(sidebar).not.toBeNull();
  expect(banBox).not.toBeNull();
  expect(banBox!.x).toBeGreaterThanOrEqual(sidebar!.width);
  expect(Math.abs(banBox!.x + banBox!.width / 2 - (sidebar!.width + viewportWidth) / 2)).toBeLessThan(2);
  expect(accessRequests).toBe(0);
  await page.keyboard.press("Escape");
  await expect(banDialog).not.toBeVisible();
  await expect(banButton).toBeFocused();
  expect(accessRequests).toBe(0);

  await banButton.click();
  await banDialog.getByRole("button", { name: "Confirm Ban" }).click();
  await expect(banDialog).not.toBeVisible();
  await expect(row.getByRole("button", { name: "Activate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeFocused();
  expect(accessRequests).toBe(1);

  await page.setViewportSize({ width: 390, height: 700 });
  const card = page.locator("article", { hasText: "Synthetic Access User" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Activate" }).click();
  const activateDialog = page.getByRole("dialog", { name: "Activate user Synthetic Access User" });
  await expect(activateDialog).toBeInViewport();
  const activateBox = await activateDialog.boundingBox();
  expect(activateBox).not.toBeNull();
  expect(activateBox!.x).toBeGreaterThanOrEqual(0);
  expect(activateBox!.x + activateBox!.width).toBeLessThanOrEqual(390);
  await activateDialog.getByRole("button", { name: "Confirm Reactivate" }).click();
  await expect(activateDialog).not.toBeVisible();
  await expect(card.getByRole("button", { name: "Ban" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeFocused();
  expect(accessRequests).toBe(2);

  const deleteButton = card.getByRole("button", { name: "Delete" });
  await deleteButton.click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete user Synthetic Access User" });
  await expect(deleteDialog).toBeInViewport();
  const deleteBox = await deleteDialog.boundingBox();
  expect(deleteBox).not.toBeNull();
  expect(deleteBox!.x).toBeGreaterThanOrEqual(0);
  expect(deleteBox!.x + deleteBox!.width).toBeLessThanOrEqual(390);
  expect(accessRequests).toBe(2);
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(deleteDialog).not.toBeVisible();
  await expect(deleteButton).toBeFocused();
  expect(accessRequests).toBe(2);

  await deleteButton.click();
  await deleteDialog.getByRole("button", { name: "Confirm Delete" }).click();
  await expect(deleteDialog).not.toBeVisible();
  await expect(page.getByText("No users match the current access-control filters.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeFocused();
  expect(accessRequests).toBe(3);
});
