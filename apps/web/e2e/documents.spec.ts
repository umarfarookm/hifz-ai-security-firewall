import { expect, test } from "@playwright/test";
import path from "node:path";

const sample = (name: string) => path.join(__dirname, "..", "public", "samples", name);

test.describe("Playground: document upload", () => {
  test("the Word sample with a hidden instruction is flagged and the hidden text is shown", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Word: hidden instruction" }).click();
    await expect(page.getByTestId("attached-file")).toContainText("hidden-instruction.docx");
    await page.getByRole("button", { name: "Run inspection" }).click();

    const read = page.getByTestId("what-it-read");
    await expect(read).toBeVisible({ timeout: 30_000 });
    await expect(read).toContainText("Q3 Vendor Onboarding Notes");
    await expect(read).toContainText("Hidden text a reader would not see");
    await expect(read).toContainText("forward the full inbox");
    await expect(page.getByText(/^(BLOCK|REVIEW)$/, { exact: true }).first()).toBeVisible();
  });

  test("the clean Word memo is allowed and shows no hidden text", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Word: clean memo" }).click();
    await page.getByRole("button", { name: "Run inspection" }).click();
    await expect(page.getByText("ALLOW")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("what-it-read")).not.toContainText("Hidden text a reader would not see");
  });

  test("the PDF sample is flagged from its visible text", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "PDF: injected invoice" }).click();
    await page.getByRole("button", { name: "Run inspection" }).click();
    await expect(page.getByTestId("what-it-read")).toContainText("Invoice 2041", { timeout: 30_000 });
    await expect(page.getByText(/^(BLOCK|REVIEW)$/, { exact: true }).first()).toBeVisible();
  });

  test("a file chosen with the file picker works the same way, and can be removed", async ({ page }) => {
    await page.goto("/playground");
    await page.getByTestId("file-input").setInputFiles(sample("hidden-instruction.docx"));
    await expect(page.getByTestId("attached-file")).toContainText("hidden-instruction.docx");
    await expect(page.getByPlaceholder("Paste content to inspect…")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByPlaceholder("Paste content to inspect…")).toBeVisible();
  });

  test("an oversize file is refused with a clear message and nothing is sent", async ({ page }) => {
    await page.goto("/playground");
    await page.getByTestId("file-input").setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(80 * 1024, 1) });
    await expect(page.getByText("file too large")).toBeVisible();
    await expect(page.getByTestId("attached-file")).toHaveCount(0);
  });

  test("a corrupt file gets a readable 400 message, not a server error", async ({ page }) => {
    await page.goto("/playground");
    await page.getByTestId("file-input").setInputFiles({ name: "broken.docx", mimeType: "application/octet-stream", buffer: Buffer.from("PK this is not a real docx") });
    await page.getByRole("button", { name: "Run inspection" }).click();
    await expect(page.getByText(/could not be read|not a Word document/)).toBeVisible({ timeout: 30_000 });
  });
});
