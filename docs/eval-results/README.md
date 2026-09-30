# Held-out evaluation results

The held-out split (109 cases: 63 attack, 46 legitimate) was never used to write or tune a detector or threshold. Detectors were frozen at `detectors-v2` (CAL-2, `docs/calibration-log.md`) before these runs. Nothing was changed after seeing these numbers.

**Recorded:** 2026-09-30, in the demo Supabase project (`eval_runs`), which is what the deployed Evaluation page reads. Reports are the two JSON files in this folder.

| | Rules only | Rules + LLM |
|---|---|---|
| Detection rate | 79.4% | 79.4% |
| False-positive rate | 0.0% | 0.0% |
| Precision / recall | 100.0% / 79.4% | 100.0% / 79.4% |
| Latency p50 / p95 | 0.1 ms / 2.9 ms | 0.3 ms / 5229.2 ms |
| Investigator status | not_called: 109 | not_called: 80, ok: 28, unavailable: 1 |

| Category | Rules only | Rules + LLM |
|---|---|---|
| credential_theft | 85.7% (n=7) | 85.7% (n=7) |
| encoded_instructions | 93.3% (n=15) | 93.3% (n=15) |
| indirect_prompt_injection | 83.3% (n=6) | 83.3% (n=6) |
| instruction_override | 75.0% (n=12) | 75.0% (n=12) |
| legitimate | 0.0% FP | 0.0% FP |
| role_change | 55.6% (n=9) | 55.6% (n=9) |
| secret_extraction | 77.8% (n=9) | 77.8% (n=9) |
| tool_abuse | 80.0% (n=5) | 80.0% (n=5) |

## What the LLM does and does not change
- **Detection rate is identical (79.4%).** On this split every escalated attack case was already flagged without the LLM (a MEDIUM+ rule band with no verdict fails safe to REVIEW), and the LLM can only raise a band, never lower one. A case the rules score below MEDIUM but inside the band (20 to 29) is where the LLM could add a detection; none occurred here.
- **It changes severity.** The count of attack cases reaching their expected minimum band rose from 37 to 48 of 63 (the "band met" column in the CLI table). That is the measurable benefit on this split.

## Caveats
- **One LLM failure.** 28 of the 29 escalated cases got a real Gemini verdict; 1 hit `unavailable` and failed safe. The recorded error text was truncated at 160 characters; it is consistent with a request timeout (`LLM_TIMEOUT_MS` = 20 s), which is unverified. A failure can only hide an LLM escalation, so the worst-case bias is that at most one legitimate case could have been raised to a false positive (FP 0.0% could be up to 2.2%). The Evaluation page shows this count.
- **An earlier `rules_llm` run is superseded.** Run `b67f31a9` (2026-09-30) was contaminated: 19 of 29 escalated cases were rejected by the free-tier rate limit (15 requests/min). The eval now throttles model requests to 12/min and records failure reasons (`packages/eval/src/throttled-gateway.ts`), and the run above was repeated once with that fix. The earlier run is still in `eval_runs` and is not deleted. No detector or threshold changed between the two runs.
- **Weakest categories** on held-out (rules only): role_change 55.6%, instruction_override 75.0%, secret_extraction 77.8%. The tuning-split figure for the same detectors was 96.4%; the held-out figure is the honest estimate.
- **Small samples.** Several categories have 5 to 9 held-out cases, so a single case moves a category by 11 to 20 points. Treat per-category numbers as indicative.
- **Model:** `gemini-flash-lite-latest`, a moving alias, free tier. Results can shift if the alias points to a different model version later.
