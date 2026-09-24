# HIFZ AI — Requirements

This file translates `docs/official-requirements.md` into functional and non-functional requirements we can actually build and test against. If this file and the official one disagree, the official one wins.

## Our commitment

| Axis | Target | Scope |
|---|---|---|
| Features (F) | **F3** | 7 attack types: Instruction Override, Role Change, Secret Extraction, Tool Abuse, Credential Theft, Encoded Instructions, Indirect Prompt Injection |
| Depth (D) | **D2** | Mostly structured/textual input, high demonstrable reliability |

Context Poisoning and Multi-Step Jailbreaks are stretch goals only — not claimed unless a formal evaluation gate says otherwise. D3 (multimodal / OCR) is out of scope for the initial build; see the go/no-go checkpoint in `docs/PLAN.md`.

**Initial input scope:** user messages, Markdown, HTML, email, API responses (JSON), source code, PDF text layer. Word documents are P2, added only if time permits.

## Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | Accept supported textual input types and identify their source and provenance. |
| FR-02 | Normalize content before analysis — Unicode normalization, zero-width/homoglyph handling, recursive decoding of Base64/hex/URL/HTML-entity content, whitespace/case folding for matching. |
| FR-03 | Detect all seven committed attack categories at the content stage, before any agent acts on the content. |
| FR-04 | Produce a risk assessment per inspection: score, band, contributing signals, and evidence spans. |
| FR-05 | Enforce a policy decision — ALLOW, SANITIZE, REVIEW, or BLOCK — based on the risk assessment. |
| FR-06 | Guarantee content is assessed before it can influence the protected demo agent. |
| FR-07 | Intercept every tool call the protected agent proposes through a deterministic Action Guard, independent of the policy decision above. |
| FR-08 | Record every security decision with a correlation ID, source, attack type(s), risk, decision, model/provider used, timestamp, and latency. |
| FR-09 | Let legitimate content through with minimal disruption, measured by false-positive rate on a held-out legitimate set. |
| FR-10 | Run a reproducible evaluation suite that reports per-category detection rate, false-positive rate, and latency. |

## Non-functional requirements

**Reliability** — D2 requires demonstrable reliability, not a claim. Every reliability number shown in the demo or deck must come from the held-out evaluation split, never the tuning split.

**Security**

- The LLM is never the final authority on a decision (see `docs/architecture/HLD.md` principle P1).
- Tool authorization is deterministic code, never delegated to a model.
- Untrusted content is always treated as data, never as instructions.
- No real credentials anywhere in the repo, logs, or demo — synthetic values only.
- Secrets live in environment variables only, never in source control.

**Observability** — every inspection and every tool-call decision is logged with enough detail to reconstruct why the system acted the way it did: detector signals, model/provider tag, latency, and the policy rule that fired.

**Model independence** — the security pipeline must not be hard-coupled to one LLM provider. Provider selection is a runtime config choice, enforced through a single gateway interface (`ModelGateway`, see `packages/agents/src/model-gateway.ts`).

## Explicitly out of scope

Kept out deliberately, to protect time for reliability over feature count:

- Multi-tenant SaaS concerns (billing, org management, SSO).
- Training or fine-tuning our own model.
- Kubernetes, Kafka, or a dedicated vector database — nothing here needs them.
- Redis or a queue, unless a concrete bottleneck shows up during load testing.
- Protecting real systems, real credentials, or real user data — every tool and secret in the demo is synthetic.

## Success criteria

The prototype is ready to submit when:

- All seven committed attack categories are implemented and independently testable.
- All seven are demonstrated live, plus a fast replay of all seven together.
- Legitimate content is demonstrated passing through with a measured false-positive rate.
- A held-out evaluation run backs every reliability claim in the deck.
- The architecture docs match what's actually implemented — no diagram describing a component that doesn't exist.
- The demo makes it visually obvious that detection happens *before* the agent acts, not after.
- A reviewer can clone the public repo and run it locally by following the README.
