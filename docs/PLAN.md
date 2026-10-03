# HIFZ AI — Build Plan (23 Sep → 11 Oct 2026)

**Team:** U = Umar Farook M (agents, web, Supabase, deployment, deck, video) · S = J Rasool Sheerin Sidhara (firewall-core, eval, datasets, policies)
Target submission: **10 Oct 2026** (one buffer day before the 11 Oct, 11:59 PM IST deadline).
Rule: P2 work never starts while any P0/P1 item is open. Tick an item only when its acceptance criterion is met, not when the code merely exists.

---

## Week 1 — Foundation and risk removal (23–29 Sep)

| # | Task | Owner | Acceptance criterion |
|---|---|---|---|
| 1.1 | Monorepo scaffold (pnpm workspaces, TS strict, lint import rules, Vitest) | U | `pnpm build && pnpm test` pass; an import-rule violation fails lint |
| 1.2 | GitHub repo under personal account; CI workflow (lint + typecheck + test), triggered manually to conserve Actions minutes | U | A manual run on `main` is green |
| 1.3 | Hello-world Next.js deployed to Vercel Hobby | U | Public URL loads; repo connected |
| 1.4 | Supabase dev + demo projects; migrations for all tables in `LLD.md` §5; RLS on | U | Migrations apply cleanly to both projects from the repo |
| 1.5 | Env validation + provider factory; smoke test each provider actually used | U | One structured-output call succeeds per configured provider |
| 1.6 | Ingest adapters: text, markdown, html (hidden text), email, json | S | Unit fixtures per adapter pass, incl. every hidden-text source in `LLD.md` §3.1 |
| 1.7 | Normalizer incl. recursive decoding with limits | S | Fixtures for NFKC, zero-width, homoglyph, Base64/hex/URL, depth cap |
| 1.8 | Detectors for Instruction Override, Role Change, Encoded Instructions | S | ≥ 5 positive + ≥ 5 negative fixtures each |
| 1.9 | Dataset v0: case format, 10 cases per committed type, 40 legitimate | S | Loader validates every file; split file committed |
| 1.10 | Measure real latency on Vercel + the chosen free-tier model | U | Numbers recorded in `docs/measurements.md`; NFR targets in `HLD.md` §15 adjusted if needed |

**Exit:** a deployed URL, a green CI, and the core pipeline catching 3 attack types in unit tests.

---

## Week 2 — Full pipeline and agents (30 Sep – 6 Oct)

| # | Task | Owner | Acceptance criterion |
|---|---|---|---|
| 2.1 | Remaining detectors: Secret Extraction, Tool Abuse, Credential Theft, Indirect Injection | S | Fixtures pass; all 7 types detectable at the content stage |
| 2.2 | Adapters: source_code, pdf text layer | S | Fixtures pass |
| 2.3 | Risk scorer with contributions + policy engine + sanitization | S | Every rule in `LLD.md` §3.7 covered by a test; sanitized output re-scanned |
| 2.4 | Eval runner: both modes, metrics, JSON report, results to DB | S | `pnpm eval --mode rules_only --split tuning` prints a per-category table |
| 2.5 | Dataset v1: ≥ 25 per type (mixed content types) + ≥ 100 legitimate + public sets | S | Attribution file lists every external source and licence |
| 2.6 | Investigator agent: bounded plan, read-only tools, schema validation, escalate-only merge, cache | U | Contract tests incl. malformed and hostile LLM outputs |
| 2.7 | Fail-safe path (provider `none`, timeout, invalid output) | U | Tests prove escalation-band cases become REVIEW |
| 2.8 | Protected email agent + seeded inbox + Action Guard G1–G6 | U | Each guard check has a passing and a failing test |
| 2.9 | API routes (`LLD.md` §4) with rate limiting + audit writes | U | Contract tests for request/response shapes and error codes |
| 2.10 | UI: Playground, Agent demo, Event detail | U | Full scenario runnable end-to-end in the browser |
| 2.11 | First calibration of thresholds on **tuning split only** | S | Changes recorded with before/after metrics |

**3 Oct checkpoint:** D3 go/no-go. **Decided: no-go.** Images are measured separately (47.6% after OCR on 36 images), so the claim stays F3 × D2 (`docs/decision-log.md`, ADR-13).
**Exit:** all 7 types caught end-to-end in the deployed app; eval runs in both modes.

---

## Week 3 — Evidence, polish, submission (7–11 Oct)

| # | Task | Owner | Acceptance criterion |
|---|---|---|---|
| 3.1 | Held-out eval, both modes; results stored | S | Report committed; numbers match the dashboard |
| 3.2 | Review queue UI + Supabase Auth reviewer | U | Approve/reject/expiry flows work on the deployed app |
| 3.3 | Dashboard + Evaluation report + Scenario replay (one per committed type) | U | Every number traces to a DB query or an eval report |
| 3.4 | Keep-alive schedule (Vercel + Supabase) | U | Verified hitting both for 48 h |
| 3.5 | README covers problem, solution, architecture, agentic workflow, attack coverage, security model, evaluation, setup, demo, limitations, future work | U+S | A fresh clone runs locally by following it |
| 3.6 | Architecture docs updated to match implemented code | U+S | No diagram describes a component that isn't implemented |
| 3.7 | Pitch deck incl. "F3 × D2 — why" slide | U | Every claim has evidence |
| 3.8 | Demo video, 2–4 min, incl. all-7 replay segment | U | Under 4:00; shows every claimed type |
| 3.9 | Submit on Unstop (repo URL, deck, video) | U | Submitted by **10 Oct** |

---

