# Dataset attribution

Task 2.5 (`docs/PLAN.md`). Every case with `origin` other than `"own"` traces back to one of the three public sources below — named in advance in `docs/architecture/HLD.md` §"Datasets" and already baked into `packages/eval/src/schema.ts`'s `origin` enum (`bipia`, `deepset`, `notinject`). Nothing here is bulk-copied wholesale: each case was individually selected, and where noted, adapted (e.g. an isolated attack instruction embedded into an original host document written for this project).

## deepset/prompt-injections

- **Source:** https://huggingface.co/datasets/deepset/prompt-injections
- **License:** Apache-2.0 (per the dataset's own metadata tags)
- **What we used:** English-language rows from the `train` and `test` splits, both `label=1` (injection) rows — used as `instruction_override`, `role_change`, and `secret_extraction` attack cases — and `label=0` (legitimate) rows, used as `legitimate` cases.
- **How:** Text copied verbatim into our `content` field (`contentType: text`, `source: user_message`). No modification beyond selecting English rows.
- **Case IDs:** `ovr-deepset-*`, `rol-deepset-*`, `sec-deepset-*`, `leg-deepset-*`.
- **Count used:** 17 attack cases, 20 legitimate cases.

## leolee99/NotInject

- **Source:** https://huggingface.co/datasets/leolee99/NotInject (from the InjecGuard paper, arXiv:2410.22770)
- **License:** MIT (per the dataset's own metadata tags)
- **What we used:** English-language prompts across all three `NotInject_one/two/three` splits — every sample here is benign but contains a word (e.g. "ignore", "unrestricted", "jailbreak") that a naive keyword-matching guard might flag. Used as `legitimate` cases specifically to test for false positives (over-defense).
- **How:** Text copied verbatim into our `content` field (`contentType: text`, `source: user_message`). No modification beyond selecting English rows.
- **Case IDs:** `leg-notinject-*`.
- **Count used:** 20 legitimate cases.

## microsoft/BIPIA

- **Source:** https://github.com/microsoft/BIPIA ("Benchmarking Indirect Prompt Injection Attacks")
- **License:** MIT for the benchmark's own code and attack-instruction templates (`LICENSE` file, `Copyright (c) Microsoft Corporation`). Note: the *background documents* BIPIA combines these templates with in its own benchmark (WikiTableQuestions, Stack Exchange content, OpenAI evals invoices) carry their own separate licenses (CC-BY-SA-4.0 / MIT) per BIPIA's own `LICENSE` file — **we did not use any of those background documents**, only BIPIA's own attack-instruction template strings (`benchmark/text_attack_{train,test}.json`), which are covered by the top-level MIT license.
- **What we used:** Attack-instruction strings from the `Scams & Fraud`, `Marketing & Advertising`, and `Misinformation & Propaganda` categories — the payloads an indirect-injection attack embeds in content an agent reads, instructing it to inject something unwanted into its own response.
- **How:** Each instruction string was embedded into an original host document written for this project (an email, HTML comment, markdown reference link, JSON field, or source code comment — all invented, containing no real names, addresses, or data), for `indirect_prompt_injection` cases.
- **Case IDs:** `ind-bipia-*`.
- **Count used:** 8 cases.

## Everything else (`origin: "own"`)

Written directly for this project — no external source. See `docs/architecture/LLD.md` §3.3 for the detector-pattern rationale behind each attack category's own-authored fixtures.
