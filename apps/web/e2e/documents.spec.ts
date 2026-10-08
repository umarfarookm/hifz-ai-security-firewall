import { expect, test } from "./fixtures";
import path from "node:path";

const sample = (name: string) => path.join(__dirname, "..", "public", "samples", name);

test.describe("Playground: document upload", () => {
  test("the Word sample with a hidden instruction is flagged and the hidden text is shown", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Word: hidden instruction" }).click();
    await expect(page.getByTestId("attached-file")).toContainText("hidden-instruction.docx");
    await page.getByRole("button", { name: "Check it" }).click();

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
    await page.getByRole("button", { name: "Check it" }).click();
    await expect(page.getByText("ALLOW")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("what-it-read")).not.toContainText("Hidden text a reader would not see");
  });

  test("the PDF sample is flagged from its visible text", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "PDF: injected invoice" }).click();
    await page.getByRole("button", { name: "Check it" }).click();
    await expect(page.getByTestId("what-it-read")).toContainText("Invoice 2041", { timeout: 30_000 });
    await expect(page.getByText(/^(BLOCK|REVIEW)$/, { exact: true }).first()).toBeVisible();
  });

  test("a file chosen with the file picker works the same way, and can be removed", async ({ page }) => {
    await page.goto("/playground");
    await page.getByTestId("file-input").setInputFiles(sample("hidden-instruction.docx"));
    await expect(page.getByTestId("attached-file")).toContainText("hidden-instruction.docx");
    await expect(page.getByPlaceholder("Paste an email, a web page or a message to check…")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByPlaceholder("Paste an email, a web page or a message to check…")).toBeVisible();
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
    await page.getByRole("button", { name: "Check it" }).click();
    await expect(page.getByText(/could not be read|not a Word document/)).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("Playground: image upload", () => {
  test("a screenshot of an attack is read by OCR and blocked", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Image: attack screenshot" }).click();
    await expect(page.getByTestId("image-preview")).toBeVisible();
    await page.getByRole("button", { name: "Check it" }).click();

    const read = page.getByTestId("what-it-read");
    await expect(read).toBeVisible({ timeout: 40_000 });
    await expect(read).toContainText("What the firewall read (by OCR)");
    await expect(read).toContainText("Ignore all previous instructions");
    await expect(page.getByText(/^(BLOCK|REVIEW)$/, { exact: true }).first()).toBeVisible();
  });

  test("a clean image note is allowed", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Image: clean note" }).click();
    await page.getByRole("button", { name: "Check it" }).click();
    await expect(page.getByText("ALLOW")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("what-it-read")).toContainText("Q3 budget review");
  });

  test("a picked PNG file works, and a fake image gets a readable 400", async ({ page }) => {
    await page.goto("/playground");
    await page.getByTestId("file-input").setInputFiles(sample("phishing-email-card.png"));
    await page.getByRole("button", { name: "Check it" }).click();
    await expect(page.getByTestId("what-it-read")).toContainText("password", { timeout: 40_000 });

    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByTestId("file-input").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("this is not an image") });
    await page.getByRole("button", { name: "Check it" }).click();
    await expect(page.getByText(/Only PNG and JPEG/)).toBeVisible({ timeout: 30_000 });
  });
});
