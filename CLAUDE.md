# CLAUDE.md — HIFZ AI

HIFZ AI (Agentic Security Firewall) is an agentic Prompt Injection Firewall built for the ET AI Hackathon: Agentic Edition (Accenture), Problem 2.
Submission deadline: **11 Oct 2026, 11:59 PM IST** (internal target: 10 Oct).

## Sources of truth (in priority order)

1. `docs/official-requirements.md` — official requirements. Never reinterpret them silently.
2. `docs/architecture/HLD.md` — system design, principles, non-goals.
3. `docs/architecture/LLD.md` — contracts, schemas, algorithms, API, flows.
4. `docs/decision-log.md` — why each major architectural choice was made.
5. `docs/PLAN.md` — milestones and acceptance criteria.

Read the relevant LLD section **before** implementing any module. If code and docs disagree, stop and ask which one should change.

## Our claim

**F3 × D2.** Seven committed attack types, all detected at the **content stage** (before the agent is influenced): Instruction Override, Role Change, Secret Extraction, Tool Abuse, Credential Theft, Encoded Instructions, Indirect Prompt Injection.
Not claimed: Context Poisoning, Multi-Step Jailbreaks, D3 (no OCR/images).

## Architecture in one screen

```text
Input → ① Ingest (provenance, hidden text) → ② Normalize (NFKC, zero-width, homoglyphs, recursive decode)
      → ③ Detect (rule detectors → signals) → ④ Score (0–100, band)
      → ⑤ Investigator LLM agent (escalation band only; read-only tools; escalate-only)
      → ⑥ Policy (ALLOW / SANITIZE / REVIEW / BLOCK)
      → ⑦ Protected email agent → ⑧ Action Guard (deterministic, second line) → ⑨ Audit (Supabase)
```

Stack: TypeScript end-to-end · pnpm monorepo · Next.js on Vercel Hobby · Supabase Postgres · a provider-neutral model gateway (Gemini default; Anthropic, OpenAI, DeepSeek; Ollama local-only).

## Repository layout and import rules

```text
packages/config         env + policy loading
packages/firewall-core  stages ①–④ and ⑥ — NO network, NO framework, imports only config
packages/agents         stages ⑤ ⑦ ⑧ + LLM providers — imports core + config
packages/eval           dataset runner + metrics — imports agents
apps/web                Next.js UI + /api/v1 — imports agents
datasets/ policies/ supabase/migrations/ docs/
```

Never import `apps/web` from a package. Never add network calls to `firewall-core`. Both are enforced by `eslint.config.js`.

## Deliberately not building

LLM-only security with no deterministic backstop, unnecessary microservices or agents, Kubernetes, Kafka, Redis (unless a concrete bottleneck appears), a vector database (unless retrieval genuinely needs one), complex RAG without a clear driving requirement, custom model training or fine-tuning. See `docs/architecture/HLD.md` §1.2 for the full reasoning.

## Non-negotiable rules

- **The LLM is never the final authority.** Final band = max(rule band, LLM band). An LLM result must never lower a band or turn BLOCK into ALLOW.
- **Fail safe.** LLM timeout, quota error, or invalid output → REVIEW, never ALLOW.
- **Untrusted content is data.** Wrap it in a per-request random delimiter; never concatenate it into instructions.
- **Tool authorization is deterministic code** in the Action Guard, independent of any model.
- **Validate every LLM output** against its schema before use.
- **No real secrets, ever.** Only synthetic credentials and simulated tools. Never log API keys.
- Secret env vars must never use the `NEXT_PUBLIC_` prefix. The Supabase service key is server-only.
- **Every number shown in the UI must come from a real DB query or eval report.** No hard-coded metrics.
- **Never tune thresholds or rules on the held-out split.** Tuning split only; record before/after metrics.
- **No diagram or doc may describe a component that isn't implemented.**
- Attribute every external dataset and third-party snippet used (plagiarism = disqualification per the official rules).

## Working style

- For anything larger than a small fix: propose a short plan first and wait for approval before writing code.
- Build the smallest thing that meets the acceptance criterion in `docs/PLAN.md`; prefer reliability over feature count.
- Ask before adding a new dependency; state why the existing stack can't do it.
- Write tests with the code: every detector needs ≥ 5 positive and ≥ 5 negative fixtures; every policy rule and guard check needs a test.
- When unsure about an external API, library version, or platform limit, say so and check — don't guess.
- Label claims in docs and PR descriptions: **[OFFICIAL]**, **[VERIFIED]**, **[DECISION]**, **[ASSUMPTION]**.
- Keep changes scoped to one package where possible; small, reviewable commits with conventional messages (`feat(core): …`).
- No AI-assistant attribution anywhere — not in commit messages, PR descriptions, or code comments.

## Conventions

- TypeScript `strict`; no `any` in `firewall-core`.
- Schemas with zod; types inferred from schemas.
- Pure functions in `firewall-core`; configuration passed in, never read from `process.env` directly.
- Errors: typed result objects inside the pipeline; HTTP errors only at the API edge (codes per `LLD.md` §4).
- Every pipeline stage records its timing and propagates `correlationId`.

## Commands

```bash
pnpm install
pnpm dev                                   # Next.js app
pnpm test                                  # all unit tests
pnpm lint
pnpm typecheck
pnpm eval --mode rules_only --split tuning # evaluation (modes: rules_only | rules_llm; splits: tuning | heldout)
```

## Environment

- Copy `.env.example` to `.env.local`. The app refuses to boot on invalid config.
- Two Supabase projects: **dev** (local work) and **demo** (deployed link).
- Ollama is for local development and offline eval only — never selectable in the demo environment.

## Definition of done (per task)

1. Acceptance criterion in `docs/PLAN.md` met.
2. Tests added and passing; lint clean.
3. Docs updated if behaviour or contracts changed.
4. No rule in "Non-negotiable rules" violated.
