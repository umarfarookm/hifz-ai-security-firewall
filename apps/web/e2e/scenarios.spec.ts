import { expect, test } from "@playwright/test";

test.describe("Scenarios", () => {
  test("lists all seven scenarios and replays one through the live pipeline", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(page.getByRole("heading", { name: "Scenarios" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(7, { timeout: 15_000 });

    const card = page.locator("section", { has: page.getByRole("heading", { name: "Tool abuse" }) });
    await card.getByRole("button", { name: "Run" }).click();

    // The rule detector fires regardless of LLM configuration, so the attack type is safe to assert.
    await expect(card.getByText("detected: tool_abuse")).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/^(BLOCK|REVIEW)$/, { exact: true }).first()).toBeVisible();
    await expect(card.getByRole("link", { name: "View full event →" })).toBeVisible();
  });
});

test.describe("Evaluation", () => {
  test("renders both splits and the live counters from the metrics API", async ({ page }) => {
    await page.goto("/evaluation");
    await expect(page.getByRole("heading", { name: "Evaluation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Held-out split" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Tuning split" })).toBeVisible();
    await expect(page.getByText(/total inspections: \d+/)).toBeVisible();
  });
});
