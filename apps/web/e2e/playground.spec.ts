import { expect, test } from "@playwright/test";

let clientCounter = 0;
/** The API limits each client address to 10 checks a minute. Giving a test its own address keeps a long run from tripping it. */
async function ownClientAddress(page: import("@playwright/test").Page) {
  clientCounter += 1;
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.77.${Date.now() % 250}.${clientCounter}` });
}

test.describe("Playground", () => {
  test("run button is disabled with no content", async ({ page }) => {
    await page.goto("/playground");
    await page.getByPlaceholder("Paste an email, a web page or a message to check…").fill("");
    await expect(page.getByRole("button", { name: "Check it" })).toBeDisabled();
  });

  test("a legitimate message is ALLOWed with a LOW band", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Legitimate message" }).click();
    await page.getByRole("button", { name: "Check it" }).click();

    await expect(page.getByText("ALLOW")).toBeVisible({ timeout: 30_000 });
    await page.getByText("Technical details").click();
    await expect(page.getByText("LOW", { exact: true })).toBeVisible();
    await expect(page.getByText("No rule detectors fired on this content.")).toBeVisible();
  });

  test("an instruction-override attack is caught, with evidence, and links to its event detail", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Instruction override" }).click();
    await page.getByRole("button", { name: "Check it" }).click();

    // Real rule detector, always fires regardless of LLM config — safe to assert unconditionally.
    await expect(page.getByTestId("technical-details")).toBeVisible({ timeout: 30_000 });
    await page.getByText("Technical details").click();
    await expect(page.getByText("OVR-001", { exact: true })).toBeVisible();
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
    await page.getByRole("button", { name: "Check it" }).click();

    await expect(page.getByText(/^(BLOCK|REVIEW)$/, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("a planted comment in source code is caught, and Source code is a selectable type", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Source code: planted comment" }).click();
    await page.getByText("More options").click();
    await expect(page.getByLabel("What kind of content is it?")).toHaveValue("source_code");
    await page.getByRole("button", { name: "Check it" }).click();

    await expect(page.getByText(/^(BLOCK|REVIEW)$/, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByText("Technical details").click();
    await expect(page.getByTestId("technical-details")).toContainText("indirect");
  });

  test("the chosen example is highlighted, and typing your own text clears the highlight", async ({ page }) => {
    await page.goto("/playground");
    const instruction = page.getByRole("button", { name: "Instruction override" });
    const legit = page.getByRole("button", { name: "Legitimate message" });
    await expect(instruction).toHaveAttribute("aria-pressed", "true");
    await legit.click();
    await expect(legit).toHaveAttribute("aria-pressed", "true");
    await expect(instruction).toHaveAttribute("aria-pressed", "false");
    await page.getByPlaceholder("Paste an email, a web page or a message to check…").fill("My own text");
    await expect(legit).toHaveAttribute("aria-pressed", "false");
  });

  test("choosing a text example after a file example clears the attachment and checks the text", async ({ page }) => {
    await page.goto("/playground");
    const word = page.getByRole("button", { name: "Word: clean memo" });
    await word.click();
    await expect(page.getByTestId("attached-file")).toBeVisible();
    await expect(word).toHaveAttribute("aria-pressed", "true");

    const legit = page.getByRole("button", { name: "Legitimate message" });
    await legit.click();
    await expect(page.getByTestId("attached-file")).toHaveCount(0);
    await expect(word).toHaveAttribute("aria-pressed", "false");
    await expect(legit).toHaveAttribute("aria-pressed", "true");
    const box = page.getByPlaceholder("Paste an email, a web page or a message to check…");
    await expect(box).toHaveValue(/Q3 budget spreadsheet/);

    const [request] = await Promise.all([page.waitForRequest("**/api/v1/inspect"), page.getByRole("button", { name: "Check it" }).click()]);
    const body = request.postDataJSON() as { content: string; contentType: string; source: string };
    expect(body.contentType).toBe("text");
    expect(body.source).toBe("user_message");
    expect(body.content).toMatch(/Q3 budget spreadsheet/);
  });

  test("a slow file example cannot overwrite a text example chosen after it", async ({ page }) => {
    await page.route("**/samples/hidden-instruction.docx", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/playground");
    await page.getByRole("button", { name: "Word: hidden instruction" }).click();
    await page.getByRole("button", { name: "Legitimate message" }).click();
    await page.waitForTimeout(2500);
    await expect(page.getByTestId("attached-file")).toHaveCount(0);
    await expect(page.getByPlaceholder("Paste an email, a web page or a message to check…")).toHaveValue(/Q3 budget spreadsheet/);
  });

  test.describe("result panel beside the input", () => {
    test.beforeEach(async ({ page }) => ownClientAddress(page));

    test("starts empty, then shows a short answer in view without scrolling, and the link jumps to the full result", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/playground");
      const panel = page.getByTestId("result-panel");
      await expect(page.getByTestId("result-panel-idle")).toBeVisible();
      await expect(panel).toBeInViewport();

      await page.getByRole("button", { name: "Legitimate message" }).click();
      await page.getByRole("button", { name: "Check it" }).click();
      await expect(page.getByTestId("result-panel-done")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("result-panel-done")).toContainText("Safe");
      await expect(panel).toBeInViewport();

      await page.getByRole("button", { name: "See the full result" }).click();
      await expect(page.getByRole("region", { name: "Result" })).toBeInViewport();
    });

    test("shows a working state while the check runs", async ({ page }) => {
      await page.route("**/api/v1/inspect", async (route) => {
        await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      });
      await page.goto("/playground");
      await page.getByRole("button", { name: "Legitimate message" }).click();
      await page.getByRole("button", { name: "Check it" }).click();
      await expect(page.getByTestId("result-panel-loading")).toBeVisible();
      await expect(page.getByTestId("result-panel-done")).toBeVisible({ timeout: 30_000 });
    });

    test("shows a held item in plain words", async ({ page }) => {
      await page.goto("/playground");
      await page.getByRole("button", { name: "Instruction override" }).click();
      await page.getByRole("button", { name: "Check it" }).click();
      await expect(page.getByTestId("result-panel-done")).toContainText(/Blocked|Held for a person/, { timeout: 30_000 });
    });

    test("shows a clear message when the check cannot run", async ({ page }) => {
      await page.goto("/playground");
      await page.getByPlaceholder("Paste an email, a web page or a message to check…").fill("a".repeat(101 * 1024));
      await page.getByRole("button", { name: "Check it" }).click();
      await expect(page.getByTestId("result-panel-error")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("result-panel-idle")).toHaveCount(0);
    });

    test("on a phone the panel sits above the examples", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/playground");
      const panel = await page.getByTestId("result-panel").boundingBox();
      const examples = await page.getByText("Not sure what to try?").boundingBox();
      expect(panel!.y).toBeLessThan(examples!.y);
      expect(panel!.width).toBeLessThanOrEqual(390);
    });
  });

  test.describe("a result never outlives the input it was for", () => {
    const BOX = "Paste an email, a web page or a message to check…";
    test.beforeEach(async ({ page }) => ownClientAddress(page));

    async function checkLegit(page: import("@playwright/test").Page) {
      await page.goto("/playground");
      await page.getByRole("button", { name: "Legitimate message" }).click();
      await page.getByRole("button", { name: "Check it" }).click();
      await expect(page.getByTestId("result-panel-done")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("region", { name: "Result" })).toBeVisible();
    }

    test("emptying the text box clears both the short and the full result", async ({ page }) => {
      await checkLegit(page);
      await page.getByPlaceholder(BOX).fill("");
      await expect(page.getByTestId("result-panel-idle")).toBeVisible();
      await expect(page.getByRole("region", { name: "Result" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Check it" })).toBeDisabled();
    });

    test("editing the text clears the old result", async ({ page }) => {
      await checkLegit(page);
      await page.getByPlaceholder(BOX).press("End");
      await page.getByPlaceholder(BOX).pressSequentially(" Thanks again.");
      await expect(page.getByTestId("result-panel-idle")).toBeVisible();
      await expect(page.getByRole("region", { name: "Result" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Check it" })).toBeEnabled();
    });

    test("removing an attached file clears the old result", async ({ page }) => {
      await page.goto("/playground");
      await page.getByRole("button", { name: "Word: clean memo" }).click();
      await page.getByRole("button", { name: "Check it" }).click();
      await expect(page.getByTestId("result-panel-done")).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: "Remove" }).click();
      await expect(page.getByTestId("result-panel-idle")).toBeVisible();
      await expect(page.getByRole("region", { name: "Result" })).toHaveCount(0);
    });

    test("changing where the content came from clears the old result", async ({ page }) => {
      await checkLegit(page);
      await page.getByText("More options").click();
      await page.getByLabel("Where did it come from?").selectOption("web_page");
      await expect(page.getByTestId("result-panel-idle")).toBeVisible();
      await expect(page.getByRole("region", { name: "Result" })).toHaveCount(0);
    });

    test("editing an error away clears the error message too", async ({ page }) => {
      await page.goto("/playground");
      await page.getByPlaceholder(BOX).fill("a".repeat(101 * 1024));
      await page.getByRole("button", { name: "Check it" }).click();
      await expect(page.getByText("content exceeds the 100KB size cap")).toBeVisible({ timeout: 30_000 });
      await page.getByPlaceholder(BOX).fill("A short message.");
      await expect(page.getByText("content exceeds the 100KB size cap")).toHaveCount(0);
      await expect(page.getByTestId("result-panel-idle")).toBeVisible();
    });

    test("a slow answer for text you have since changed is ignored", async ({ page }) => {
      await page.route("**/api/v1/inspect", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });
      await page.goto("/playground");
      await page.getByRole("button", { name: "Legitimate message" }).click();
      await page.getByRole("button", { name: "Check it" }).click();
      await expect(page.getByTestId("result-panel-loading")).toBeVisible();
      await page.getByPlaceholder(BOX).fill("Something else entirely.");
      await expect(page.getByTestId("result-panel-idle")).toBeVisible();
      await page.waitForTimeout(2500);
      await expect(page.getByTestId("result-panel-idle")).toBeVisible();
      await expect(page.getByRole("region", { name: "Result" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Check it" })).toBeEnabled();
    });
  });

  test("an oversized body is rejected with a 413", async ({ page }) => {
    await page.goto("/playground");
    await page.getByPlaceholder("Paste an email, a web page or a message to check…").fill("a".repeat(101 * 1024));
    await page.getByRole("button", { name: "Check it" }).click();

    await expect(page.getByText("content exceeds the 100KB size cap")).toBeVisible({ timeout: 30_000 });
  });
});
