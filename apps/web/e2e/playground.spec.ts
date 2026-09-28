import { expect, test } from "@playwright/test";

test.describe("Playground", () => {
  test("run button is disabled with no content", async ({ page }) => {
    await page.goto("/playground");
    await page.getByPlaceholder("Paste content to inspect…").fill("");
    await expect(page.getByRole("button", { name: "Run inspection" })).toBeDisabled();
  });

  test("a legitimate message is ALLOWed with a LOW band", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Legitimate message" }).click();
    await page.getByRole("button", { name: "Run inspection" }).click();

    await expect(page.getByText("ALLOW")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("LOW", { exact: true })).toBeVisible();
    await expect(page.getByText("No rule detectors fired on this content.")).toBeVisible();
  });

  test("an instruction-override attack is caught, with evidence, and links to its event detail", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Instruction override" }).click();
    await page.getByRole("button", { name: "Run inspection" }).click();

    // Real rule detector, always fires regardless of LLM config — safe to assert unconditionally.
    await expect(page.getByText("OVR-001", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("instruction override", { exact: true })).toBeVisible();
    await expect(page.getByText(/^(BLOCK|REVIEW)$/, { exact: true }).first()).toBeVisible();

    const eventLink = page.getByRole("link", { name: "View full event →" });
    await expect(eventLink).toBeVisible();
    await eventLink.click();

    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Event detail" })).toBeVisible();
    await expect(page.getByText("Score breakdown")).toBeVisible();
  });

  test("a base64-encoded attack is caught", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Base64-encoded attack" }).click();
    await page.getByRole("button", { name: "Run inspection" }).click();

    await expect(page.getByText(/^(BLOCK|REVIEW)$/, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("an oversized body is rejected with a 413", async ({ page }) => {
    await page.goto("/playground");
    await page.getByPlaceholder("Paste content to inspect…").fill("a".repeat(101 * 1024));
    await page.getByRole("button", { name: "Run inspection" }).click();

    await expect(page.getByText("content exceeds the 100KB size cap")).toBeVisible({ timeout: 30_000 });
  });
});
