import { expect, test } from "@playwright/test";

test.describe("navigation", () => {
  test("home links to the Playground and Agent demo screens", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const nav = page.locator("header nav");
    await nav.getByRole("link", { name: "Playground" }).click();
    await expect(page).toHaveURL(/\/playground$/);
    await expect(page.getByRole("heading", { name: "Playground" })).toBeVisible();

    await nav.getByRole("link", { name: "Agent demo" }).click();
    await expect(page).toHaveURL(/\/agent$/);
    await expect(page.getByRole("heading", { name: "Agent demo" })).toBeVisible();
  });
});
