# HIFZ AI — Measurements

Real, measured numbers against the non-functional targets in `docs/architecture/HLD.md` §15. Task 1.10 in `docs/PLAN.md`. Everything here comes from an actual run recorded on **2026-09-26**; if these numbers are old by the time you're reading this, re-run the scripts referenced below and update this file rather than trusting stale numbers.

## Deterministic path (Ingest → Normalize → Detect → Score)

**Target:** p95 < 150 ms, server-side, excluding network.

**Method:** `pnpm --filter @hifz/eval run measure-latency` — runs all 110 committed dataset cases through the real `ingestAdapters` → `normalize` → `runDetectors` → `scoreRisk` chain, timed with `process.hrtime.bigint()` around each stage. This is pure CPU with zero I/O, so measuring it locally is a fair proxy for "server-side, excluding network" — the same V8 bytecode runs on Vercel's Node runtime. One warm-up pass runs first so JIT warm-up doesn't skew the timings.

**[VERIFIED] Result:**

| Stage | p50 | p95 | max |
|---|---|---|---|
| Ingest | 0.000 ms | 0.022 ms | 0.036 ms |
| Normalize | 0.008 ms | 0.026 ms | 0.038 ms |
| Detect | 0.007 ms | 0.016 ms | 0.024 ms |
| Score | 0.000 ms | 0.012 ms | 0.108 ms |
| **Total (①–④)** | **0.017 ms** | **0.063 ms** | **0.144 ms** |

**PASS**, with roughly 2,000× headroom against the 150 ms target. This isn't surprising — the current pipeline is regex-based pattern matching over strings up to a few hundred characters; there's no reason to expect this stage to ever be the bottleneck. The real cost in the full pipeline will be the LLM path below.

## LLM path (Investigator agent)

**Target:** p95 < 8,000 ms on a free-tier model.

**Method:** `pnpm --filter @hifz/eval run measure-llm-latency` — samples 2 cases from each of the 8 dataset categories (16 total), runs each through the real ingest/normalize/detect stages locally to get real detector signals, then POSTs `{content, signals}` to the **live, deployed** `/api/v1/dev/investigate` route on production Vercel (`gemini-flash-lite-latest`) and times the full round trip from this machine. This measurement intentionally includes network — both this machine's link to Vercel and Vercel's own call out to Gemini — since the target doesn't carry the "excluding network" qualifier the deterministic target does; a p95 measured this way is a reasonable, if slightly conservative (upper-bound), read on the real experience.

**[VERIFIED] Result:**

| | |
|---|---|
| n | 16 |
| min | 338 ms |
| p50 | 1,161 ms |
| p95 | 4,626 ms |
| max | 4,626 ms |
| Reliability | 11/16 returned a usable verdict (`ok`) on the first pass |

**PASS**, with the p95 at roughly 58% of the 8 s budget.

**What the reliability number actually shows:** of the 5 non-`ok` results, 1 was `invalid_output` (the investigator's structured output failed schema validation — the same real, occasional LLM variance documented when task 2.6/2.7 were built) and 4 came back `unavailable` in under 400 ms each, right after a burst of ~12 calls in quick succession. Retrying two of those same cases moments later succeeded (`ok`) with no code change — this points to Gemini's free-tier per-minute rate limit, not a bug. This is exactly the risk HLD §18 already calls out ("Free-tier LLM quota limits evaluation") and exactly the scenario the fail-safe path (task 2.7, `docs/architecture/LLD.md` §3.7 POL-004) exists for: a rate-limited or otherwise unavailable LLM degrades to REVIEW, never to a silent ALLOW.

**Methodology caveat, stated plainly:** this endpoint (`/api/v1/dev/investigate`) is a temporary dev-only route, not the real `/api/v1/inspect` (task 2.9) — the pipeline it exercises is real (ingest → normalize → detect → investigator agent, hitting real Gemini), but it skips the policy engine and audit write that the final route will also do. Re-run this measurement once 2.9 ships to confirm the added stages don't meaningfully change the picture — they're both fast, deterministic, in-process work, so they shouldn't.

**Note on how this was measured safely:** production is configured with `INVESTIGATOR_PROVIDER=none` by default (no rate limiting exists yet — task 2.9 — so a real-provider dev endpoint sitting open on the public internet indefinitely would be a real exposure). For this measurement, the provider was temporarily switched to Gemini in the Vercel dashboard, the 16 calls were run, and it was switched back to `none` immediately after. Don't leave it switched on.

## NFR targets — no adjustment needed

Both latency targets in `docs/architecture/HLD.md` §15 hold up against real measurement with meaningful margin — no change to either target. §15 now marks them `[VERIFIED]` with these numbers instead of `[ASSUMPTION]`; the false-positive-rate and detection-rate targets in the same table stay `[ASSUMPTION]` until the eval runner (task 2.4) exists to measure them against the held-out split.

## A real production bug this exercise caught

While setting up the LLM-path measurement, `/api/v1/dev/investigate` started returning empty `500`s in production. Vercel's function logs showed `NEXT_PUBLIC_SUPABASE_ANON_KEY: Required` — that variable had been silently dropped from the production environment during an env-var cleanup two days earlier (2026-09-24) and never re-added, because `NEXT_PUBLIC_` variables are baked into the build at build time, so nothing surfaced the gap until a route that calls `loadEnv()` actually ran in production. Fixed by re-adding the variable (`--type config`, since it's meant to be public — Supabase anon keys are protected by Row Level Security, not secrecy) and redeploying. This had been live and broken for two days without anyone noticing, since nothing had exercised env validation in production until this measurement — worth remembering as a gap in our own verification discipline, not just a one-off mistake.
