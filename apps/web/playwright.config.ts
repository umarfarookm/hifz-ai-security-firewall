import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the three screens built in task 2.10. These tests hit the
 * real pipeline — real Supabase (hifz-ai-dev), real Gemini calls when the
 * escalation band or the agent demo triggers them — there is no mocked
 * backend here, same "test against the real thing" approach as the rest of
 * this repo (see docs/measurements.md). That means:
 *   - .env.local must be present and valid (`pnpm typecheck` would already
 *     have failed otherwise).
 *   - Tests run serially (workers: 1) so they don't blow through
 *     /agent/run's 3 req/min rate limit (LLD §9) against each other.
 *   - Every test run writes real rows to hifz-ai-dev. That's expected, not
 *     a leak — this is a dev project, not the demo one judges see.
 */
// E2E_PORT runs the suite on its own server, so it can never attach to some other app already on port 3000.
const PORT = process.env.E2E_PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI && !process.env.E2E_PORT,
    timeout: 60_000,
  },
});
