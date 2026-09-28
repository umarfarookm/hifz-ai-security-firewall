# Testing HIFZ AI

This is the practical "how do I actually test this" doc — what test layers exist, where they live, how to run them, and what to click through by hand before calling a UI change done. See `LLD.md` §11 for the testing *strategy* (what each layer is responsible for); this doc is the day-to-day companion to that.

## Layers, in order of how fast they run

| Layer | What it checks | Where | Command |
|---|---|---|---|
| Unit | Every adapter, normalizer step, detector, scorer, policy rule, guard check | `packages/*/src/**/*.test.ts` | `pnpm test` |
| Contract | API route request/response shapes and error codes, using an in-memory audit writer + scripted LLM gateway — no live Supabase or LLM call | `apps/web/lib/*.test.ts` | `pnpm test` (same command, included in the same run) |
| E2E | The three UI screens (Playground, Agent demo, Event detail), driven through a real browser, against the real dev pipeline | `apps/web/e2e/*.spec.ts` | `pnpm --filter @hifz/web run test:e2e` |
| Evaluation | Full dataset, both modes, metrics | `packages/eval` | `pnpm eval --mode rules_only --split tuning` |

`pnpm test` and `pnpm typecheck` and `pnpm lint` run everywhere fast and don't touch any real service — run those constantly while working. The E2E suite is the one that costs real time and real API calls, so it's not part of the fast inner loop; run it before merging a UI change, or when you want to actually see the flow work end to end.

## Running the E2E suite

```bash
pnpm --filter @hifz/web run test:e2e        # headless, CLI output
pnpm --filter @hifz/web run test:e2e:ui     # Playwright's interactive UI mode — watch it click through the app
```

First time only: `pnpm --filter @hifz/web exec playwright install chromium`.

**These tests are not mocked.** They start a real `next dev` server (the config's `webServer` block does this for you — you don't need to start one yourself), which talks to the real `hifz-ai-dev` Supabase project and makes real Gemini calls whenever a case lands in the escalation band or the agent demo runs. This means:

- `.env.local` must exist and be valid, same as running the app normally.
- Every run writes real rows into `hifz-ai-dev` — expected, not a leak. That project exists for exactly this.
- Timings are real and vary. `playground.spec.ts`'s escalation-band assertions use a 30s timeout because a live Gemini call has genuinely taken as long as ~15s during testing — don't drop these to make the suite feel faster.
- `agent.spec.ts` intentionally does **not** assert a specific `llmStatus` or a specific sequence of tool calls. A live multi-turn agent conversation can legitimately end in `ok` or `unavailable` (that's the fail-safe path task 2.7 covers, not a bug), and which tools it calls on a given run isn't fully deterministic. What's asserted is that the round trip completes and the UI renders *some* real outcome.
- `/agent/run` is capped at 3 req/min (LLD §9). The suite only calls it once, deliberately, and runs serially (`workers: 1` in `playwright.config.ts`) — don't parallelize this suite or add more `/agent/run` calls without accounting for that limit.

If a test fails, `playwright-report/` (opened automatically, or via `pnpm --filter @hifz/web exec playwright show-report`) has a trace with screenshots and network calls — check that before assuming the app is broken; it might just be Gemini being slow or rate-limited that minute.

## Manual QA checklist

For a change that's hard to express as an assertion (does this actually look right, does the flow feel right), walk through this by hand. Budget ~10 minutes.

**Setup:** `pnpm --filter @hifz/web run dev`, open `http://localhost:3000`.

### Home (`/`)
- [ ] Loads without a flash of unstyled content.
- [ ] Both cards link to the right screens.

### Playground (`/playground`)
- [ ] Click each of the three example buttons — content, type, and source all update together.
- [ ] "Run inspection" is disabled with empty content, enabled otherwise.
- [ ] Run the legitimate example → decision is `ALLOW`, band `LOW`, "No rule detectors fired" shown, no verdict card (LLM wasn't needed).
- [ ] Run the instruction-override example → decision is `BLOCK` or `REVIEW`, `OVR-001` appears under Evidence with the matched text highlighted, and (if the score landed in the escalation band) an Investigator verdict card appears with a rationale and a plan trace.
- [ ] Click "View full event →" → lands on `/events/{id}`, same score/band/signals/verdict are shown there too, plus the score breakdown by contribution factor.
- [ ] Paste something larger than 100KB → a clear 413-style error appears, not a raw stack trace.
- [ ] Try an empty `contentType`/`source` combination you don't normally use (e.g. `email` + `tool_output`) — shouldn't error.

### Agent demo (`/agent`)
- [ ] Inbox panel populates with the 7 seeded emails (from, subject, preview) without you doing anything.
- [ ] Run the default instruction → a pipeline trace appears listing each tool call with a guard outcome badge (`EXECUTE` / `BLOCK` / `REQUIRE_APPROVAL`) and the guard's reason.
- [ ] Try the "reply to anything urgent" example, or write your own instruction that asks the agent to act on the phishing email in the inbox — confirm the agent either declines or, if it does attempt something risky, the guard visibly blocks/holds it. (The model has resisted this in every manual test so far — if you ever see it comply and the guard *not* catch it, that's a real finding, flag it immediately.)
- [ ] Send 4 requests within a minute → the 4th should be visibly rate-limited, not silently ignored.

### Event detail (`/events/[id]`)
- [ ] Reached only via a real event id (from a Playground run or `/api/v1/events`) — a made-up id shows a proper 404, not a crash.
- [ ] All five sections render when the data supports them: score breakdown, decision + rule id, raw content excerpt, timings, signals, investigator verdict (when present), guard checks (when present).

## What's deliberately not covered yet

- `GET /reviews`, `POST /reviews/{id}/decision`, `GET /metrics`, `GET/POST /scenarios` — not built (see `docs/PLAN.md` 2.10 notes); no tests for what doesn't exist.
- Cross-browser E2E — Chromium only for now. Add `firefox`/`webkit` projects to `playwright.config.ts` if that becomes a requirement.
- Visual regression (pixel diffing) — not set up. The manual checklist above is the current substitute for "does this look right."
