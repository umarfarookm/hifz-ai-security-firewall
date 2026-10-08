import { expect, test as base } from "@playwright/test";

/**
 * The API limits each client address (checks 10 a minute, agent runs 3 a minute). A fast server lets one
 * test file use up the limit before the next file starts, so every test gets its own client address.
 * Only the test run's own server sees this header; nothing in the app changes.
 */
let counter = 0;
const runId = Math.floor(Math.random() * 200) + 20;

export const test = base.extend({
  page: async ({ page }, use) => {
    counter += 1;
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${runId}.${Math.floor(counter / 250)}.${(counter % 250) + 1}` });
    await use(page);
  },
});

export { expect };
