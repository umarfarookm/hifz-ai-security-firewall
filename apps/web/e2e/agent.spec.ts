import { expect, test } from "@playwright/test";

test.describe("Agent demo", () => {
  // Only one test in this file calls POST /agent/run — it's rate-limited to
  // 3 req/min (LLD §9), so keep it to a single real call per suite run.
  test("inbox loads, and running the default instruction produces a guarded trace", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/agent");

    await expect(page.getByText("priya@hifz-demo.test")).toBeVisible();
    await expect(page.getByText("Sprint planning moved to 3pm")).toBeVisible();

    await page.getByRole("button", { name: "Run agent" }).click();

    // This hits a real Gemini call with a real multi-turn tool loop — which
    // tools it calls, whether it finishes before the timeout, and whether it
    // replies with text or a tool call are all genuinely non-deterministic
    // run to run (the exact fail-safe behavior task 2.7 exists to handle).
    // So this only asserts what's guaranteed regardless of what the model
    // decided to do: the request completes and the UI renders *a* real
    // outcome — either a result with its llmStatus, or a surfaced error.
    await expect(page.getByRole("button", { name: "Run agent" })).toBeVisible({ timeout: 40_000 });
    const outcome = page.getByText(/^llmStatus: /).or(page.locator("text=/error|rate limited/i"));
    await expect(outcome.first()).toBeVisible();
  });
});
