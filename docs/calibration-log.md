# HIFZ AI — Calibration Log

Records every time a scoring/policy constant (thresholds, severity weights, detector confidences) is
calibrated against real data. **Tuning split only** — held-out is never used to tune anything
(CLAUDE.md's non-negotiable rule). Each entry states what was measured, what changed (if anything),
and the before/after numbers.

Produced with `pnpm --filter @hifz/eval run calibrate` (a read-only report — it never edits the
scorer itself) and `pnpm eval --mode rules_only --split tuning`.

---

## CAL-1 — First calibration of `RISK_THRESHOLD_MEDIUM/HIGH/CRITICAL` (task 2.11)

**Dataset:** 166 tuning-split cases (108 attack, 58 legitimate) from dataset v1 (task 2.5).
**Date:** 2026-09-29. **Git SHA:** see the eval_runs row this baseline was recorded under.

**Method:** for every tuning-split case, ran ingest → normalize → detect → score (rules only,
`sessionRisk = 0`, matching how each case is scored independently — see
`packages/eval/src/measure-latency.ts`'s comment for the same reasoning) and checked whether the
resulting score, at a range of candidate `MEDIUM` thresholds, would have cleared the band.

**Finding 1 — no near misses.** Every tuning-split case where at least one detector fired already
scored well clear of the current `MEDIUM` threshold (30) — zero cases landed in the 1–29 range.
There is no "raise/lower the threshold by a few points" adjustment available in this data; the
detectors' severity/confidence weights (`SEVERITY_BASE`, per-detector `confidence` in
`packages/firewall-core/src/detect/rules/*.ts`) produce scores that are either 0 (no signal) or
comfortably ≥ 30.

**Finding 2 — the real gap is detector coverage, not thresholds.** 39 of 108 attack cases (36%)
scored 0 — no detector matched at all, so no threshold value can affect them. Breakdown:

| Category | Zero-signal cases (of 108 total attack cases) |
|---|---|
| indirect_prompt_injection | 11 |
| secret_extraction | 9 |
| credential_theft | 7 |
| tool_abuse | 5 |
| instruction_override | 4 |
| role_change | 2 |
| encoded_instructions | 1 |

This is a real, useful finding — but it's a task for the detector rules themselves (more phrasing
patterns per attack type), not for `2.11`'s scope. Tracked as a follow-up, not fixed here.

**Sensitivity table (MEDIUM threshold candidates, HIGH=60/CRITICAL=85 held fixed):**

| MEDIUM | Detection rate | FP rate |
|---|---|---|
| 15 | 63.9% | 0.0% |
| 20 | 63.9% | 0.0% |
| 25 | 63.9% | 0.0% |
| **30 (current)** | **63.9%** | **0.0%** |
| 35 | 62.0% | 0.0% |
| 40 | 62.0% | 0.0% |

Lowering `MEDIUM` all the way to 15 changes nothing (no case lives in that range). Raising it to
35 loses ~2 points of detection with no FP benefit (FP rate is already 0% at every candidate — no
legitimate tuning-split case scores above 0 in a way threshold movement would touch either).

**Decision [DECISION]:** keep `RISK_THRESHOLD_MEDIUM/HIGH/CRITICAL` at their current defaults
(30/60/85). The data shows no headroom to gain detection by moving `MEDIUM` down, and moving it up
only costs detection — 30 is already the best point in the tested range. This *is* a completed
calibration pass (verified against real data, decision recorded), not a skipped one — "the
defaults already hold" is a legitimate outcome, not the absence of one.

**Before/after:** before = after (63.9% detection / 0.0% FP on the tuning split) — no code change,
because none was justified by the data. If detector coverage improves in a future dataset
iteration, re-run `pnpm --filter @hifz/eval run calibrate` — the near-miss and sensitivity numbers
may look different once more attack phrasing patterns actually produce non-zero signals.

**Baseline recorded:** `pnpm eval --mode rules_only --split tuning` — overall detection rate
65.2%*, FP rate 0.0%, precision 100.0%, recall 65.2%. (*Slightly above the 63.9% figure in this
log: the eval runner's detection rate counts any non-ALLOW action including SANITIZE/REVIEW paths
influenced by the fail-safe/escalation logic, not raw rules-only score-vs-threshold like this
calibration pass does — the two numbers measure related but not identical things, which is why
this log computes its own score-only sensitivity table instead of reusing the eval summary
directly.) Full JSON report and `eval_runs`/`eval_results` DB rows from that run are the
"before" baseline for any future calibration pass.
