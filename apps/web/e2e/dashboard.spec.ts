import { expect, test } from "@playwright/test";

test.describe("Dashboard", () => {
  test("shows live counters, the four risk bands, the latest events and the held-out summary from the API", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const counts = page.getByLabel("Headline counts");
    await expect(counts).toBeVisible({ timeout: 30_000 });
    for (const label of ["Inspections", "ALLOW", "SANITIZE", "REVIEW", "BLOCK", "Awaiting review"]) {
      await expect(counts.getByText(label, { exact: false }).first()).toBeVisible();
    }

    // The band distribution is always four rows, low to critical.
    const rows = page.getByLabel("Inspections by risk band").getByRole("listitem");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("LOW");
    await expect(rows.nth(3)).toContainText("CRITICAL");

    await expect(page.getByRole("heading", { name: "Latest events" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Held-out evaluation" })).toBeVisible();
    await expect(page.getByText(/Could not load the dashboard/)).toHaveCount(0);
  });

  test("is linked from the navigation", async ({ page }) => {
    await page.goto("/");
    await page.locator("header nav").getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
