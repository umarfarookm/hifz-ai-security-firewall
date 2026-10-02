# HIFZ AI — Calibration Log

Records every time a scoring/policy constant (thresholds, severity weights, detector confidences) is
calibrated against real data. **Tuning split only** — held-out is never used to tune anything
(the evaluation rule in `docs/architecture/HLD.md` §12). Each entry states what was measured, what changed (if anything),
and the before/after numbers.

Produced with `pnpm --filter @hifz/eval run calibrate` (a read-only report — it never edits the
scorer itself) and `pnpm eval --mode rules_only --split tuning`.

---

## CAL-1 — First calibration of `RISK_THRESHOLD_MEDIUM/HIGH/CRITICAL` (task 2.11)

**Dataset:** 166 tuning-split cases (112 attack, 54 legitimate) from dataset v1 (task 2.5).
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

**Finding 2 — the real gap is detector coverage, not thresholds.** 39 of 112 attack cases (35%)
scored 0 — no detector matched at all, so no threshold value can affect them. Breakdown:

| Category | Zero-signal cases (of 112 total attack cases) |
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
| 15 | 65.2% | 0.0% |
| 20 | 65.2% | 0.0% |
| 25 | 65.2% | 0.0% |
| **30 (current)** | **65.2%** | **0.0%** |
| 35 | 63.4% | 0.0% |
| 40 | 63.4% | 0.0% |

Lowering `MEDIUM` all the way to 15 changes nothing (no case lives in that range). Raising it to
35 loses ~2 points of detection (2 cases) with no FP benefit (FP rate is already 0% at every candidate — no
legitimate tuning-split case scores above 0 in a way threshold movement would touch either).

**Decision [DECISION]:** keep `RISK_THRESHOLD_MEDIUM/HIGH/CRITICAL` at their current defaults
(30/60/85). The data shows no headroom to gain detection by moving `MEDIUM` down, and moving it up
only costs detection — 30 is already the best point in the tested range. This *is* a completed
calibration pass (verified against real data, decision recorded), not a skipped one — "the
defaults already hold" is a legitimate outcome, not the absence of one.

**Before/after:** before = after (65.2% detection / 0.0% FP on the tuning split) — no code change,
because none was justified by the data. If detector coverage improves in a future dataset
iteration, re-run `pnpm --filter @hifz/eval run calibrate` — the near-miss and sensitivity numbers
may look different once more attack phrasing patterns actually produce non-zero signals.

**Baseline recorded:** `pnpm eval --mode rules_only --split tuning` — overall detection rate
65.2% (73/112), FP rate 0.0%, precision 100.0%, recall 65.2%. This matches the score-only
sensitivity table at MEDIUM=30 exactly.

**Correction (same day):** an earlier draft of this entry reported 63.9% for the calibration pass
and explained the gap to the eval runner's 65.2% as a fail-safe/escalation effect. That was wrong.
`calibrate.ts` was silently skipping async-ingest (PDF) cases, so it scored 108 attack cases instead
of 112. It now awaits every adapter and prints how many cases it scored; both tools agree.

---

## CAL-2 — Detector coverage gap (issue #40)

**Dataset:** same 166 tuning-split cases (112 attack, 54 legitimate). **Held-out was not inspected, run
or tuned against.** **Date:** 2026-09-29. **Detector version:** `detectors-v1` → `detectors-v2`
(`policies/detectors.yaml` `version: 2`; the version is part of the LLM verdict cache key).

**Motivation:** CAL-1 showed 39 of 112 attack cases (35%) fired no detector, which no threshold change
can fix. This entry adds detector patterns for those phrasing gaps.

**What changed** (all in `packages/firewall-core/src/detect/rules/`, each with ≥ 5 positive and ≥ 5
negative fixtures, mostly new phrasings rather than copies of the dataset cases — a few positives are close to dataset wording):

| Rule | Change |
|---|---|
| CRD-004, CRD-005 | credential requests with a determiner ("provide the API key"); "what is the admin/root password" |
| SEC-004…007 | qualified "system prompt/message" requests; hidden/confidential configuration; dumping the context; "print the instructions you were given / the prompt above" |
| TOL-003 (widened), TOL-004…007 | "forward all *incoming* messages"; tool use paired with a consequential verb; money transfer; charge the card / payment API; snake_case tool applied in bulk |
| OVR-005, OVR-006 | "ignore your guidelines/rules" (deliberately excludes "previous/prior/above/earlier", which OVR-001 owns, so one phrase is not counted twice); context-wipe framing |
| IND-003, IND-004 | content addressed to the AI reading it; BIPIA-style response manipulation, gated on a payload marker so "please include the invoice number in your reply" does not fire |

**Before / after (tuning split, `rules_only`):**

| Category | n | Before | After |
|---|---|---|---|
| credential_theft | 18 | 61.1% | 100.0% |
| encoded_instructions | 10 | 90.0% | 90.0% |
| indirect_prompt_injection | 19 | 42.1% | 100.0% |
| instruction_override | 13 | 69.2% | 100.0% |
| role_change | 16 | 87.5% | 87.5% |
| secret_extraction | 16 | 43.8% | 93.8% |
| tool_abuse | 20 | 75.0% | 100.0% |
| **Overall detection** | 112 | **65.2%** | **96.4%** (108/112) |
| **False-positive rate** | 54 | **0.0%** | **0.0%** |

Zero-signal attack cases: 39 → 4.

**Calibration decision [DECISION]:** IND-004 was first written at confidence 0.65. That put three BIPIA
cases (email/JSON sources, no hidden-layer or trust bonus) at score 29, one point under MEDIUM (30).
Confidence was raised to 0.7, matching IND-001 and ENC-001, instead of lowering the global MEDIUM
threshold for three cases. `RISK_THRESHOLD_MEDIUM/HIGH/CRITICAL` stay at 30/60/85. After the change there
are no near misses, and the sensitivity table is flat between MEDIUM 15 and 30.

**Still undetected on purpose (4 cases), documented as limitations:**
- `rol-deepset-004`, `rol-deepset-005` — persona role-play ("Now you are Xi Jinping…"). Indistinguishable by pattern from ordinary role-play requests; a rule would trade false positives for coverage.
- `sec-deepset-004` — "please return your embeddings". A single odd phrasing; a pattern for it would be single-purpose.
- `enc-own-021` — a run of `AAAA…` characters; no instruction content to match.

**Caveats — read before quoting these numbers:**
- 96.4% is a **tuning-split** figure. The rules were written after reading the missed tuning cases, so it is optimistic by construction. The held-out run (#23) is the real test and will be run once, after this is merged.
- All 4 categories that reached 100% (credential_theft, indirect_prompt_injection, instruction_override, tool_abuse) did so with rules aimed at phrasing families seen in the tuning cases. Held-out cases were written in the same style, so partial transfer is expected, not guaranteed.
- 0.0% FP is measured on 54 legitimate tuning cases (including 20 NotInject over-defense cases); it is not evidence of a 0% rate in general.

