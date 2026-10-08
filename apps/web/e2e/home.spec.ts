import { expect, test } from "./fixtures";

test.describe("Home", () => {
  test("asks the question, links to the Playground, and shows live counts from the metrics API", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Is this safe for your AI to read?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Check something" }).first()).toHaveAttribute("href", "/playground");
    await expect(page.getByLabel("So far on this site")).toContainText(/items? checked|Nothing has been checked yet/, { timeout: 20_000 });
  });

  test("the menu lists all six pages, each with a one-line caption", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main menu" });
    for (const name of ["Playground", "Agent demo", "Scenarios", "Reviews", "Dashboard", "Evaluation"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
  });
});
