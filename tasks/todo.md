# Task list: document and image inputs

Plan: [`plan.md`](plan.md). Approved 2026-10-02. **All work on `feat/document-image-inputs`; `main` is untouched until the user decides to merge.** Verify on the branch preview, not production. Internal target 2026-10-10.

## Phase 0: De-risk (first)
- [x] T0: OCR-on-Vercel spike. **PASSED on a Vercel preview (2026-10-02):** offline, no CDN, all 5 images read correctly (incl. low-contrast and rotated), worker ready 575 ms, 5 images 1.7 s total, 163 MB rss. Findings for T9: the Node worker ignores `corePath` and `require()`s the core, so the `.wasm` files must be traced from the real `.pnpm` directory; add an `errorHandler`. **Phase 4 gate: GO**

## Phase 1: Binary-input foundation
- [x] T1: Bad files return a clean 400 (`IngestError`)
- [x] T2: Small-file limits (100 KB, 5-page PDF), LLM text cap (~6,000 chars), readable excerpt
- [x] Checkpoint A: green build; tuning eval still 96.4% / 0.0%

## Phase 2: DOCX adapter
- [x] T3: Safe zip read + visible text (`fflate`, bomb fixtures)
- [x] T4: Hidden-text sources (vanish, near-white, tiny, deleted, comments, footnotes)
- [x] T5: Real-file validation (**user:** save one Word file with hidden text)
- [x] T6: End-to-end through `/inspect`
- [x] Checkpoint B: docx works through the real API locally

## Phase 3: Demo UI for PDF and DOCX
- [x] T7: Playground file upload + "what the firewall read" panel
- [x] T8: Samples and upload e2e
- [x] Checkpoint C: verified on a Vercel preview (2026-10-02, branch-scoped Preview env vars: dev DB, rules-only). docx, real Word file, PDF and OCR images all correct. Found and fixed a PDF bug there (pdfjs worker path became a webpack module id). Ingest 1-5 ms for docx/PDF, ~110 ms warm and ~930 ms cold for OCR; total 1.6-3.8 s per request is mostly the app-to-database hop

## Phase 4: Images via OCR (only if T0 passed; start by 2026-10-05)
- [x] T9: Image adapter (`image` type + DB migration, PNG/JPEG, caps)
- [x] T10: Image UI
- [x] T11: Image mini-suite (separate, honest numbers)
- [x] Checkpoint D: decide the grid claim, record it

## Phase 5: Docs and decisions
- [x] T12: decision-log, HLD, LLD, README, demo-script, diagrams re-validated
- [ ] Checkpoint E: done

## Decisions and user tasks
- [x] `fflate` dependency (approved with the plan)
- [x] Small files only (user, 2026-10-02): keep the 100 KB cap, PDF <= 5 pages, image <= 1600 px; no cap increase. DeepSeek cost bounded by a ~6,000-char LLM text cap
- [x] Images: go, time-boxed behind T0
- [x] Server-side `tesseract.js`, not an LLM extractor
- [x] Grid claim stays F3 x D2 (Checkpoint D, ADR-13: image suite 47.6% rules-only, 36 images)
- [x] User: created a real Word `.docx` with hidden text (T5), verified 2026-10-02
- [x] `image` enum migration applied to dev (2026-10-02). **Still open:** apply to the demo project before any release
