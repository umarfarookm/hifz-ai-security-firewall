# HIFZ — Demo and Pitch Plan

## Core story

AI agents increasingly consume untrusted content — emails, web pages, API responses. HIFZ sits in front of the agent and stops malicious instructions from ever influencing it, while letting legitimate content through with minimal friction.

## Demo video outline (target 3:30, hard limit 4:00)

| Time | Segment | What it proves |
|---|---|---|
| 0:00–0:20 | A legitimate task — email assistant summarising an inbox | ALLOW works; the agent behaves normally |
| 0:20–1:10 | Indirect injection hidden in an HTML email → detected, evidence shown → the agent's attempted `send_email` with a fake secret is blocked | Detection before influence; Action Guard as second line |
| 1:10–1:40 | Encoded (Base64) attack → decoded layer surfaced → blocked | The decoder/re-scan layer catches obfuscation |
| 1:40–2:10 | All 7 committed types replayed back to back, with the per-category held-out table on screen | F3 coverage, backed by real numbers |
| 2:10–2:30 | Legitimate content passing + measured false-positive rate | D2 reliability claim, not just detection |
| 2:30–2:50 | LLM provider unavailable → fail-safe REVIEW → human approves | P4 fail-safe principle, human oversight |
| 2:50–3:30 | Architecture recap (Ingest → Normalize → Detect → Score → Investigate → Policy → Guard → Audit) + impact framing | Ties the demo back to the architecture doc |

## Pitch deck outline

1. HIFZ — title
2. The problem: agents that read untrusted content are exposed today
3. Why this matters — real-world impact of prompt injection
4. The solution, in one sentence
5. How HIFZ works — pipeline overview
6. Security architecture — trust boundaries, fail-safe design
7. The seven attack categories we detect
8. Evaluation methodology — tuning vs. held-out, public datasets used
9. Results — per-category detection, false-positive rate, latency
10. Responsible AI and human oversight
11. F3 × D2 — why, with evidence
12. Live demo
13. Impact and scalability
14. What's next (Context Poisoning, Multi-Step Jailbreaks, D3)
15. Team

## F3 × D2 justification slide

State explicitly, with evidence for each line:

- **F3:** seven attack categories implemented and demonstrated live.
- **D2:** mostly structured/textual input, backed by held-out evaluation results — not just an assertion.
- Evidence to show: input coverage, attack coverage, evaluation methodology, per-category results, legitimate-content results.

Never claim D3 unless a later multimodal evaluation actually supports it — overestimating the grid position is penalized as heavily as underestimating it.

## One rule that overrides everything else here

The deck and the demo must never claim functionality that doesn't exist in the repository. If a slide says it, the repo has to prove it.
