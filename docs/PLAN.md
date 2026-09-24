# HIFZ — Build Plan (23 Sep → 11 Oct 2026)

Target submission: **10 Oct 2026** (one buffer day before the 11 Oct, 11:59 PM IST deadline).
Rule: P2 work never starts while any P0/P1 item is open. Tick an item only when its acceptance criterion is met, not when the code merely exists.

---

## Week 1 — Foundation and risk removal (23–29 Sep)

| # | Task | Acceptance criterion |
|---|---|---|
| 1.1 | Monorepo scaffold (pnpm workspaces, TS strict, lint import rules, Vitest) | `pnpm build && pnpm test` pass; an import-rule violation fails lint |
| 1.2 | GitHub repo under personal account; CI workflow (lint + typecheck + test), triggered manually to conserve Actions minutes | A manual run on `main` is green |
| 1.3 | Hello-world Next.js deployed to Vercel Hobby | Public URL loads; repo connected |
| 1.4 | Supabase dev + demo projects; migrations for all tables in `LLD.md` §5; RLS on | Migrations apply cleanly to both projects from the repo |
| 1.5 | Env validation + provider factory; smoke test each provider actually used | One structured-output call succeeds per configured provider |
| 1.6 | Ingest adapters: text, markdown, html (hidden text), email, json | Unit fixtures per adapter pass, incl. every hidden-text source in `LLD.md` §3.1 |
| 1.7 | Normalizer incl. recursive decoding with limits | Fixtures for NFKC, zero-width, homoglyph, Base64/hex/URL, depth cap |
| 1.8 | Detectors for Instruction Override, Role Change, Encoded Instructions | ≥ 5 positive + ≥ 5 negative fixtures each |
| 1.9 | Dataset v0: case format, 10 cases per committed type, 40 legitimate | Loader validates every file; split file committed |
| 1.10 | Measure real latency on Vercel + the chosen free-tier model | Numbers recorded in `docs/measurements.md`; NFR targets in `HLD.md` §15 adjusted if needed |

**Exit:** a deployed URL, a green CI, and the core pipeline catching 3 attack types in unit tests.

---

## Week 2 — Full pipeline and agents (30 Sep – 6 Oct)

| # | Task | Acceptance criterion |
|---|---|---|
| 2.1 | Remaining detectors: Secret Extraction, Tool Abuse, Credential Theft, Indirect Injection | Fixtures pass; all 7 types detectable at the content stage |
| 2.2 | Adapters: source_code, pdf text layer | Fixtures pass |
| 2.3 | Risk scorer with contributions + policy engine + sanitization | Every rule in `LLD.md` §3.7 covered by a test; sanitized output re-scanned |
| 2.4 | Eval runner: both modes, metrics, JSON report, results to DB | `pnpm eval --mode rules_only --split tuning` prints a per-category table |
| 2.5 | Dataset v1: ≥ 25 per type (mixed content types) + ≥ 100 legitimate + public sets | Attribution file lists every external source and licence |
| 2.6 | Investigator agent: bounded plan, read-only tools, schema validation, escalate-only merge, cache | Contract tests incl. malformed and hostile LLM outputs |
| 2.7 | Fail-safe path (provider `none`, timeout, invalid output) | Tests prove escalation-band cases become REVIEW |
| 2.8 | Protected email agent + seeded inbox + Action Guard G1–G6 | Each guard check has a passing and a failing test |
| 2.9 | API routes (`LLD.md` §4) with rate limiting + audit writes | Contract tests for request/response shapes and error codes |
| 2.10 | UI: Playground, Agent demo, Event detail | Full scenario runnable end-to-end in the browser |
| 2.11 | First calibration of thresholds on **tuning split only** | Changes recorded with before/after metrics |

**3 Oct checkpoint:** D3 go/no-go (default: no-go).
**Exit:** all 7 types caught end-to-end in the deployed app; eval runs in both modes.

---

## Week 3 — Evidence, polish, submission (7–11 Oct)

| # | Task | Acceptance criterion |
|---|---|---|
| 3.1 | Held-out eval, both modes; results stored | Report committed; numbers match the dashboard |
| 3.2 | Review queue UI + Supabase Auth reviewer | Approve/reject/expiry flows work on the deployed app |
| 3.3 | Dashboard + Evaluation report + Scenario replay (one per committed type) | Every number traces to a DB query or an eval report |
| 3.4 | Keep-alive schedule (Vercel + Supabase) | Verified hitting both for 48 h |
| 3.5 | README covers problem, solution, architecture, agentic workflow, attack coverage, security model, evaluation, setup, demo, limitations, future work | A fresh clone runs locally by following it |
| 3.6 | Architecture docs updated to match implemented code | No diagram describes a component that isn't implemented |
| 3.7 | Pitch deck incl. "F3 × D2 — why" slide | Every claim has evidence |
| 3.8 | Demo video, 2–4 min, incl. all-7 replay segment | Under 4:00; shows every claimed type |
| 3.9 | Submit on Unstop (repo URL, deck, video) | Submitted by **10 Oct** |

---

See `docs/demo-and-pitch.md` for the demo video outline and deck structure.
