# Task list: document and image inputs

Plan: [`plan.md`](plan.md). Approved 2026-10-02. Open PRs per phase. Internal target 2026-10-10.

## Phase 0: De-risk (first)
- [ ] T0: OCR-on-Vercel spike (tesseract.js, offline model, preview deployment). **Gate for Phase 4**

## Phase 1: Binary-input foundation
- [ ] T1: Bad files return a clean 400 (`IngestError`)
- [ ] T2: Per-type size cap, PDF page cap and timeout, readable excerpt
- [ ] Checkpoint A: green build; tuning eval still 96.4% / 0.0%

## Phase 2: DOCX adapter
- [ ] T3: Safe zip read + visible text (`fflate`, bomb fixtures)
- [ ] T4: Hidden-text sources (vanish, near-white, tiny, deleted, comments, footnotes)
- [ ] T5: Real-file validation (**user:** save one Word file with hidden text)
- [ ] T6: End-to-end through `/inspect`
- [ ] Checkpoint B: docx works through the real API locally

## Phase 3: Demo UI for PDF and DOCX
- [ ] T7: Playground file upload + "what the firewall read" panel
- [ ] T8: Samples and upload e2e
- [ ] Checkpoint C: production verified, p95 measured at the cap

## Phase 4: Images via OCR (only if T0 passed; start by 2026-10-05)
- [ ] T9: Image adapter (`image` type + DB migration, PNG/JPEG, caps)
- [ ] T10: Image UI
- [ ] T11: Image mini-suite (separate, honest numbers)
- [ ] Checkpoint D: decide the grid claim, record it

## Phase 5: Docs and decisions
- [ ] T12: decision-log, HLD, LLD, README, demo-script, diagrams re-validated
- [ ] Checkpoint E: done

## Decisions and user tasks
- [x] `fflate` dependency (approved with the plan)
- [x] 512 KB binary cap (approved; measured, lowered if slow)
- [x] Images: go, time-boxed behind T0
- [x] Server-side `tesseract.js`, not an LLM extractor
- [x] Grid claim stays F3 x D2 until image numbers exist
- [ ] User: create a real Word `.docx` with hidden text (T5)
- [ ] User: apply the `image` enum migration to the demo project (T9)
