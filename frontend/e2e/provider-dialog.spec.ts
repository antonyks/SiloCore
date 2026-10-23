import { expect, test } from "./support/fixtures";

test("provider dialogs stay usable from a long list on desktop and mobile", async ({ page, stack }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Admin123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\/dashboard$/);

  await page.route(`${stack.apiUrl}/admin/llm/providers`, async (route) => {
    await route.fulfill({
      json: {
        data: Array.from({ length: 25 }, (_, index) => ({
          id: index + 100,
          name: `Synthetic Provider ${index + 1}`,
          type: "ollama",
          baseUrl: "http://127.0.0.1:11434",
          enabled: true,
          defaultModel: "synthetic-model",
          timeoutMs: 5000,
          generationDefaults: {},
          extraHeaders: {},
          hasApiKey: false,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          capabilities: { modelPulling: true },
        })),
      },
    });
  });
  await page.goto("/admin/llm/providers");

  const row = page.getByRole("row", { name: /Synthetic Provider 25/ });
  const editButton = row.getByRole("button", { name: "Edit" });
  await editButton.click();
  const editDialog = page.getByRole("dialog", { name: "Edit provider Synthetic Provider 25" });
  await expect(editDialog).toBeInViewport();
  await expect(editDialog.getByRole("textbox", { name: "Name" })).toBeFocused();
  const sidebar = await page.locator("aside").boundingBox();
  const editBox = await editDialog.boundingBox();
  const editCloseBox = await editDialog.getByRole("button", { name: "Close dialog" }).boundingBox();
  const editCancelBox = await editDialog.getByRole("button", { name: "Cancel" }).boundingBox();
  const editSaveBox = await editDialog.getByRole("button", { name: "Save Provider" }).boundingBox();
  const desktopWidth = page.viewportSize()!.width;
  expect(sidebar).not.toBeNull();
  expect(editBox).not.toBeNull();
  expect(editBox!.x).toBeGreaterThanOrEqual(sidebar!.width);
  expect(Math.abs(editBox!.x + editBox!.width / 2 - (sidebar!.width + desktopWidth) / 2)).toBeLessThan(2);
  expect(editCloseBox!.x).toBeGreaterThan(editBox!.x + editBox!.width - 56);
  expect(editCloseBox!.y).toBeLessThan(editBox!.y + 56);
  expect(Math.abs(editCancelBox!.y - editSaveBox!.y)).toBeLessThan(2);
  expect(editCancelBox!.x + editCancelBox!.width).toBeLessThanOrEqual(editSaveBox!.x);
  await editDialog.locator("[data-dialog-scroll]").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(editDialog.getByRole("button", { name: "Close dialog" })).toBeInViewport();
  const scrolledCloseBox = await editDialog.getByRole("button", { name: "Close dialog" }).boundingBox();
  expect(scrolledCloseBox!.y).toBeLessThan(editBox!.y + 56);
  const listScrollPosition = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("Escape");
  await expect(editDialog).not.toBeVisible();
  await expect(editButton).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(listScrollPosition);

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator("aside")).toHaveCSS("width", "64px");
  await editButton.click();
  await expect(editDialog).toBeInViewport();
  const collapsedSidebar = await page.locator("aside").boundingBox();
  const collapsedEditBox = await editDialog.boundingBox();
  expect(collapsedEditBox!.x).toBeGreaterThanOrEqual(collapsedSidebar!.width);
  expect(Math.abs(collapsedEditBox!.x + collapsedEditBox!.width / 2 - (collapsedSidebar!.width + desktopWidth) / 2)).toBeLessThan(2);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 700 });
  await row.getByRole("button", { name: "Pull" }).click();
  const pullDialog = page.getByRole("dialog", { name: "Pull model for Synthetic Provider 25" });
  await expect(pullDialog).toBeInViewport();
  const box = await pullDialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(Math.abs(box!.x + box!.width / 2 - 195)).toBeLessThan(2);
  expect(Math.abs(box!.y + box!.height / 2 - 350)).toBeLessThan(2);
  await page.keyboard.press("Escape");
  await expect(pullDialog).not.toBeVisible();

  await editButton.click();
  await expect(editDialog).toBeInViewport();
  const mobileEditBox = await editDialog.boundingBox();
  expect(mobileEditBox).not.toBeNull();
  expect(mobileEditBox!.x + mobileEditBox!.width).toBeLessThanOrEqual(390);
  await editDialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(editDialog).not.toBeVisible();
});
