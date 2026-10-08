import { expect, test } from "./fixtures";

// Regression: a long unbroken string (e.g. pasted base64) used to stretch the Event detail page far past the viewport.
test("a long unbroken input does not make the event page scroll sideways", async ({ page, request }) => {
  const res = await request.post("/api/v1/inspect", {
    data: { content: "A".repeat(4000), contentType: "text", source: "user_message" },
  });
  expect(res.ok()).toBeTruthy();
  const { eventId } = await res.json();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/events/${eventId}`);
  await expect(page.getByRole("heading", { name: "Event detail" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
