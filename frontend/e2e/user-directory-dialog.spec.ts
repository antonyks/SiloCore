import { expect, test } from "./support/fixtures";

test("user directory dialogs stay accessible from the list on desktop and mobile", async ({ page, stack }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Admin123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\/dashboard$/);

  const users = Array.from({ length: 10 }, (_, index) => ({
    id: index + 100,
    name: `Synthetic User ${index + 1}`,
    email: `synthetic-${index + 1}@example.com`,
    role: "USER",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
  }));
  await page.route(`${stack.apiUrl}/users**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/users")) {
      await route.fulfill({ json: { data: users, total: users.length } });
      return;
    }
    const id = Number(pathname.split("/").at(-1));
    await route.fulfill({ json: { data: users.find((user) => user.id === id) } });
  });
  await page.goto("/admin/users");

  const row = page.getByRole("row", { name: /Synthetic User 10/ });
  const editButton = row.getByRole("button", { name: "Edit" });
  await editButton.click();
  const editDialog = page.getByRole("dialog", { name: "Edit user Synthetic User 10" });
  await expect(editDialog).toBeInViewport();
  await expect(editDialog.getByRole("textbox", { name: "Name" })).toBeFocused();
  const sidebar = await page.locator("aside").boundingBox();
  const editBox = await editDialog.boundingBox();
  const closeBox = await editDialog.getByRole("button", { name: "Close dialog" }).boundingBox();
  const cancelBox = await editDialog.getByRole("button", { name: "Cancel" }).boundingBox();
  const saveBox = await editDialog.getByRole("button", { name: "Save User" }).boundingBox();
  const viewportWidth = page.viewportSize()!.width;
  expect(sidebar).not.toBeNull();
  expect(editBox).not.toBeNull();
  expect(editBox!.x).toBeGreaterThanOrEqual(sidebar!.width);
  expect(Math.abs(editBox!.x + editBox!.width / 2 - (sidebar!.width + viewportWidth) / 2)).toBeLessThan(2);
  expect(closeBox!.x).toBeGreaterThan(editBox!.x + editBox!.width - 56);
  expect(closeBox!.y).toBeLessThan(editBox!.y + 56);
  expect(Math.abs(cancelBox!.y - saveBox!.y)).toBeLessThan(2);
  expect(cancelBox!.x + cancelBox!.width).toBeLessThanOrEqual(saveBox!.x);
  await page.keyboard.press("Escape");
  await expect(editDialog).not.toBeVisible();
  await expect(editButton).toBeFocused();

  await editButton.click();
  await editDialog.getByRole("button", { name: "Save User" }).click();
  await expect(editDialog).not.toBeVisible();
  const notice = page.getByRole("status");
  await expect(notice).toContainText("Synthetic User 10 was updated.");
  await expect(notice).toBeInViewport();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await row.getByRole("button", { name: "View" }).click();
  const viewDialog = page.getByRole("dialog", { name: "User detail" });
  await expect(viewDialog).toBeInViewport();
  await expect(viewDialog.getByText("synthetic-10@example.com")).toBeVisible();
  await viewDialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(viewDialog).not.toBeVisible();

  await page.setViewportSize({ width: 390, height: 700 });
  const userCard = page.locator("article", { hasText: "Synthetic User 10" });
  await expect(userCard).toBeVisible();
  await expect(userCard.getByText("synthetic-10@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Add User" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add user" });
  await expect(addDialog).toBeInViewport();
  const addBox = await addDialog.boundingBox();
  expect(addBox).not.toBeNull();
  expect(addBox!.x).toBeGreaterThanOrEqual(0);
  expect(addBox!.x + addBox!.width).toBeLessThanOrEqual(390);
  expect(Math.abs(addBox!.x + addBox!.width / 2 - 195)).toBeLessThan(2);
  expect(Math.abs(addBox!.y + addBox!.height / 2 - 350)).toBeLessThan(2);
  await addDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(addDialog).not.toBeVisible();
});
