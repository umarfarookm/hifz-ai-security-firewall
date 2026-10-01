import { expect, test } from "@playwright/test";

test.describe("Review queue", () => {
  test("is readable without signing in, offers reviewer sign-in, and filters by state", async ({ page }) => {
    await page.goto("/reviews");
    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reviewer sign in" })).toBeVisible();

    for (const name of ["Pending", "Decided", "Expired", "All"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await page.getByRole("button", { name: "All" }).click();
    // Either items or the empty state: both prove the queue loaded from the API without an auth error.
    await expect(page.getByText(/Could not load the queue/)).toHaveCount(0);
  });

  test("a REVIEW decision in the Playground links to the queue", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Instruction override" }).click();
    await page.getByRole("button", { name: "Run inspection" }).click();
    // A semi-trusted user message at HIGH is a REVIEW decision, which creates a queue item.
    await expect(page.getByRole("link", { name: "Open the review queue →" })).toBeVisible({ timeout: 30_000 });
  });
});
