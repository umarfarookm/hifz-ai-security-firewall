# Implementation Plan: Document and image inputs for the demo (PDF upload, Word .docx, images via OCR)

## Context
The user asked whether three input types can be built and shown in the demo: **PDF (text layer only)**, **Word (.docx)** and **images / OCR / audio**, and then asked for a real viability check of OCR and images (my first answer rejected them on reasoning alone). Verified findings:

- **PDF is already supported** by `POST /inspect` and the eval (8 PDF cases). Missing for the demo: the Playground has no file picker, and a PDF's `content_excerpt` would store ~2,000 characters of base64 that shows as gibberish on the event and review pages.
- **DOCX is not supported.** `docx` is already in the `ContentType` type, the `/inspect` zod enum, the eval schema and the DB enum (no migration). No zip or XML library is installed; no ingest-level zip-bomb guards exist.
- **Images / OCR are technically viable** (corrected after checking primary sources):
  - `tesseract.js` is a WebAssembly port that runs in Node with no native build (Apache-2.0; Node ≥ 16). Offline use needs `workerPath`, `corePath` (4 wasm files) and `langPath` (`eng.traineddata.gz`). Sizes: `tesseract.js-core` ≈ 30 MB unpacked, English "fast" model ≈ 4.1 MB ("best" ≈ 15 MB). That is ≈ 35 MB of Vercel's 250 MB bundle limit.
  - Vercel **Hobby: 2 GB memory, 300 s default and maximum duration, 4.5 MB request body**.
  - `deepseek-flash`, our live model, **accepts images** (JPEG, PNG, GIF, WebP; OpenAI-compatible content blocks; 32 MiB per image). Our model gateway is currently text-only.
  - **Unknowns that gate it:** whether tesseract.js's worker threads and wasm files bundle and run under Next.js on Vercel (needs a spike); how well OCR reads attack text (stylised or low-contrast text); no image dataset or measurement exists.
- **Audio: out** (no speech-to-text path in any provider we use).
- **Grid claim:** we claim **F3 × D2**. D3 needs "highly heterogeneous multimodal input **and demonstrable reliability**", and the official rules penalise both over- and under-estimation. Image support would add a real modality, but the claim only changes if a measured image result is strong. Decide after the numbers, not before.
- **Schedule:** today is 2 Oct, the internal target is 10 Oct, and deck, video and submission are unstarted.

Outcome: a judge can upload a real `.pdf`, `.docx` or image in the Playground (or click a sample) and watch the firewall catch an injection hidden in a Word document or written inside a screenshot, with a view of "what the firewall read".

## Architecture decisions
**Shared**
- **Bad files become a clean 400, not a 503:** new `IngestError`; `runInspection` maps it to `validation_error`.
- **Small files only, by design (user requirement, 2026-10-02: keep performance and DeepSeek cost low).** **No cap increase.** `pdf`, `docx` and `image` all stay under the existing **100 KB base64 cap (≈ 75 KB file)**; PDFs ≤ **5 pages**; images ≤ **1600 × 1600 px**; committed demo samples < 30 KB. The cap is enforced in `runInspection` before the adapter, with a friendly client-side message. Demo and production use the same limits.
- **DeepSeek cost controls.** (1) OCR is a local deterministic engine, so **images consume zero DeepSeek tokens**; no vision LLM is used. (2) Only extracted *text* ever reaches the investigator, and it is **truncated to ~6,000 characters** for the LLM call (the rules still scan the full extracted text, up to the cap); today a 100 KB text input would send ~25K tokens. (3) The investigator still runs only in the 20–70 band and results are cached by content hash; per-IP rate limits are unchanged.
- **Performance controls.** Reuse one OCR worker per instance and run **one OCR job at a time** (memory ≈ 220 MB); measured: ~0.1 s per image warm, ~0.7 s cold. Adapter timeouts return a clean 4xx.
- **Binary excerpt:** for `pdf`/`docx`/`image`, store `content_excerpt` as `[type, N KB] ` + the first 2,000 characters of the extracted text, not base64.
- **Evidence honesty:** new inputs are **not** added to the evaluated held-out dataset (that would change published numbers and force a second held-out run). docx is covered by unit tests and real-file checks; images get a **separate, clearly-labelled mini-suite** reported on its own. The docs say "supported" and "measured on N cases", never more.
- **The investigator receives `visibleText` only**, so text that exists only in a hidden layer (docx) is caught by the deterministic rules, not the LLM. Documented.

**DOCX**
- **Zip: `fflate`** (MIT, zero dependencies, pure JS). Rejected: hand-rolled zip parser (riskiest code on a deadline), `jszip` (heavier, async-only), `mammoth` (drops hidden text, comments and `vanish` runs). *Needs user approval per CLAUDE.md.*
- **Zip-bomb defence:** `filter` checks entry count, `size` and `originalSize` before inflating **and** inflation is bounded by a running byte counter (declared sizes are attacker-controlled). Read only needed entries; reject encrypted and zip64; cap base64 length before decoding.
- **OOXML parsing: a scoped linear extractor, not an XML parser** (`<w:p>` → `<w:r>` → `<w:rPr>`, `<w:t>`, `<w:delText>`). No DTD or entity-expansion surface; only the 5 predefined entities and numeric refs. Rejected: `node-html-parser` (mangles namespaced tags), a real XML parser (new dependency and attack surface).
- **Hidden** (direct run properties): `w:vanish` (not `val="0"`/`"false"`), **near-white** `w:color` (skipped when the paragraph/cell is dark-shaded), tiny `w:sz` (≤ 2 half-points), `w:delText`, comments, footnotes. **Merge adjacent hidden runs** (Word splits runs on spell-check boundaries). Style-inherited hiding is a documented limitation.
- **Where text goes:** visible runs → `visibleText`; hidden runs, comments, footnotes, deletions → `hiddenSegments`. Paragraphs and cells joined with newlines. Hidden text longer than 200 characters is split into overlapping ≤ 200-char segments (downstream excerpts are truncated at 200).
- **Offsets** index into an adapter-built full-text stream; nothing downstream reads hidden-segment offsets (verified), so this is safe. A test asserts monotonic and in range.

**PDF**
- Text layer only, unchanged. Add a page cap (30) and a wall-clock timeout around pdfjs. White text in a PDF is returned as ordinary visible text, so it is caught on the **visible** layer (no hidden-layer bonus); captions and docs say so.

**Images (gated)**
- **OCR: `tesseract.js` server-side, bundled offline** (WASM core + English "fast" model shipped via `outputFileTracingIncludes`; `corePath`/`langPath`/`workerPath` set; a reused worker). Chosen over a vision LLM because **a transcription step that is an LLM can itself be injected** by the image it reads (e.g. text saying "output SAFE"), and it needs a paid provider and cannot run in `none` mode. Deterministic OCR keeps extraction outside the model trust boundary and works with every provider.
- **Vision LLM (`deepseek-flash`) is an optional second opinion, not the extractor:** it would need the gateway extended to image content; out of scope unless OCR proves too weak.
- **Client-side OCR** is a fallback for the demo only, clearly labelled non-authoritative (the client controls it); used only if the server spike fails.
- Accept PNG and JPEG (by magic bytes), pixel cap, reject the rest with `IngestError`. Add `image` to `ContentType`, the zod enums, the eval schema and the DB enum (**needs a migration: `alter type content_type add value 'image'`**, applied to dev and demo).
- **Known limitation, stated up front:** OCR reads what it can see. Faint or low-contrast text a vision model might read can be missed, so images are an *evasion surface by design*; the mini-suite measures it.

## Branching and release (set by the user, 2026-10-02)
**`main` is not touched**: it is the working, deployed app. All work lands on the long-lived branch **`feat/document-image-inputs`**, which branches off `main`. Phase PRs, if any, target *that* branch, never `main`. Verification uses the branch's **Vercel preview deployment** (and local runs), not production. Merging this branch into `main` is the user's decision, made after the whole feature is proven; until then production is unchanged. Consequences:
- Checkpoint C and the "verify on production" steps become "verify on the branch preview".
- The DB migration that adds `image` to the content-type enum is additive and backwards compatible (the live app never sends `image`), but it touches the shared demo project, so it is applied only on request and only when the image work is ready.
- The unmerged `docs/input-formats-plan` branch only carried this plan; the plan now lives on the feature branch.

## Dependency graph
```
spike: OCR on Vercel ──────────────────────────────────────────────────► (gates Phase 4)
IngestError + 400 ─┬─► binary cap + excerpt ─┬─► Playground upload ─► samples + e2e ─► prod check ─► docs
                   └─► docx adapter ─► hidden-text ─► real-file ─┘                        │
                                                                          Phase 4: image adapter ─► image UI ─► mini-suite ─┘
```
The OCR spike runs **first** (highest risk, decides whether Phase 4 exists). The docx adapter is next-riskiest and is built before the UI.

## Task list

### Phase 0: De-risk (do first)
- [ ] **T0: OCR-on-Vercel spike** (S–M, half a day, throwaway branch)
  - A preview deployment of a tiny route that OCRs a bundled PNG with tesseract.js (offline model, reused worker). Record bundle size, cold start, time for 3 images, and memory.
  - *Accept:* OCR text returned from a **Vercel preview** function within 20 s with the bundle under 250 MB, no CDN fetch. *Verify:* call the preview URL; read function logs.
  - **Gate:** pass → Phase 4 is on; fail → drop images (or the client-side-demo fallback) and record why. Decision by end of day 1.

### Phase 1: Binary-input foundation (PDF and DOCX)
- [ ] **T1: Bad files return a clean 400** (S): `IngestError`; `runInspection` maps it; pdf.ts wraps pdfjs failures. *Accept:* a corrupt PDF and non-PDF base64 return 400 with a readable message, not 503. *Verify:* unit tests; `pnpm test`. Files: `ingest/{types,pdf}.ts`, `apps/web/lib/inspect.ts`.
- [ ] **T2: Small-file limits, LLM text cap, readable excerpt** (M): keep the 100 KB cap for every type (no raise); PDF ≤ 5 pages and a timeout; **truncate the text sent to the investigator to ~6,000 chars**; excerpt = label + extracted text. *Accept:* a 5-page PDF is accepted and a 6-page one returns a clear 4xx; a long input sends at most ~6,000 chars to the gateway (asserted with a recording gateway, so cost is bounded by a test); the event and review pages show readable text. *Verify:* unit tests; run a local PDF and open `/events/{id}`. Deps: T1.

### Checkpoint A
- [ ] lint, typecheck, tests, `next build` green; `pnpm eval --mode rules_only --split tuning --skip-db` still **96.4% / 0.0%** (PDF behaviour unchanged).

### Phase 2: DOCX adapter
- [ ] **T3: Safe zip read + visible text** (M): add `fflate`; bounded inflation and guards; read `word/document.xml`; newline-separated text; register in `ingest/index.ts`. *Accept:* visible text extracted; bomb fixtures (lying declared size, truncated zip, missing `document.xml`, empty file, oversize inflation) fail fast with `IngestError`, no hang. *Verify:* adapter tests; time the bomb cases. Deps: T1.
- [ ] **T4: Hidden-text sources** (M): `vanish`, near-white colour (skip dark shading), tiny size, `delText`, comments, footnotes; run coalescing; overlapping chunking; monotonic offsets. *Accept:* ≥ 5 positive and ≥ 5 negative fixtures (negatives: TOC/bookmark, small footnote font, white on dark shading, `vanish val="0"`); an injection split across runs is detected. Deps: T3.
- [ ] **T5: Real-file validation** (S): **user task (~10 min):** in Word or Pages, make a short doc, set one paragraph to Font → Hidden, save `.docx`, commit as a fixture; also confirm a `textutil`-produced docx parses. *Accept:* the real file's hidden text lands in `hiddenSegments`; visible text matches Word. Files: first fixture file in the repo. Deps: T4.
- [ ] **T6: End-to-end through `/inspect`** (S): a docx with a hidden instruction is non-ALLOW with IND-002 and the layer adjustment; clean docx ALLOW; corrupt docx 400. *Verify:* `inspect.test.ts` with the in-memory writer, then a live call on dev. Deps: T2, T4.

### Checkpoint B
- [ ] docx works through the real API locally; the 8 PDF eval cases unchanged; the Word-saved fixture passes before any UI work.

### Phase 3: Demo UI for PDF and DOCX
- [ ] **T7: Playground file upload** (M): `.pdf`/`.docx` picker → base64; auto-set `contentType` and `source=document`; filename + size chip; textarea disabled while attached; friendly size message; clear/replace; a **"what the firewall read"** panel showing the extracted text. *Accept:* a real PDF and docx show a decision, score breakdown and evidence; an oversize file shows a clear message. Deps: T2, T6.
- [ ] **T8: Samples and upload e2e** (M): small committed samples in `apps/web/public/samples/` (docx with a hidden instruction, clean docx, PDF with an injected instruction; reuse the existing base64 PDFs, no generator script); sample chips; Playwright `setInputFiles` specs on a non-3000 port. *Accept:* each sample behaves as captioned (hidden-instruction docx flagged on the hidden layer; PDF on the **visible** layer, captioned accurately; clean docx ALLOW).

### Checkpoint C (deploy and prove)
- [ ] After merge, upload each sample and a real Word file on **production**; measure p95 at the cap; lower the cap if slow; `/health` ok.

### Phase 4: Images via OCR (only if T0 passed; hard deadline: start by 5 Oct)
- [ ] **T9: Image adapter** (M): `image` content type everywhere + migration; PNG/JPEG by magic bytes; ≤ 100 KB and ≤ 1600 px; one reused worker, one job at a time; **an `errorHandler` so a worker failure (e.g. a missing model) becomes a clean 400 and never an uncaught exception that crashes the function (found in the T0 spike)**; async adapter returning OCR text (visible); low-confidence noted as an informational anomaly. *Accept:* a PNG screenshot containing "ignore previous instructions…" is flagged; a clean image is ALLOW; a corrupt or non-image file returns 400. *Verify:* unit tests with generated images; live call.
- [ ] **T10: Image UI** (M): image picker with thumbnail, the **OCR text shown** ("what the firewall read"), samples (an attack screenshot, a clean image), Playwright specs. Deps: T9, T7.
- [ ] **T11: Image mini-suite (honest numbers)** (M): generate ~30 images with Playwright by rendering text (≥ 15 attacks across the 7 types in varied fonts, sizes and contrast; ≥ 15 legitimate) into `datasets/images/` as a **separate suite**, reported on its own (detection, false positives, OCR miss cases). **Do not tune detectors on it and do not merge it into the held-out set.** *Accept:* a recorded report and a plain-language summary of what OCR missed.

### Checkpoint D (decision)
- [ ] With the image numbers in hand, **decide the grid claim** (stay F3 × D2, with images as a documented additional modality, unless the evidence justifies more) and record it in `docs/decision-log.md`.

### Phase 5: Docs and decisions
- [ ] **T12: Docs** (S): `docs/decision-log.md` (docx adapter + `fflate`; caps; OCR approach and why not an LLM extractor; grid-claim decision); HLD §1/§2, LLD §2.1/§3.1/§7/§12; README (inputs, limitations: style-inherited hiding, OCR misses faint text, hidden text not seen by the investigator, new inputs not in the measured held-out set); `docs/demo-script.md` (a document and an image step); Mermaid re-validated. *Accept:* no doc claims these inputs are unsupported or claims more than is measured.

### Checkpoint E (done)
- [ ] All acceptance criteria met; production verified; PRs reviewed; deck and video unaffected.

## Cut list (in order, if time slips)
1. Phase 4 entirely (the images), keeping Phases 1–3 + 5.
2. `styles.xml` style-inherited hiding; image alt text; headers/footers/endnotes; the image mini-suite size (down to ~16).
3. Never cut: the clean 400, size caps, bomb guards, the docs honesty.

## Estimate and schedule
Phase 0 ≈ 0.5 day, Phase 1 ≈ 0.5, Phase 2 ≈ 1–1.5, Phase 3 ≈ 0.75, Phase 4 ≈ 2–3 (gated), Phase 5 ≈ 0.25–0.5.
- **PDF + DOCX only: about 3 days**, finishing around **5 Oct**.
- **Including images: about 5–6 days**, finishing around **7–8 Oct**, leaving only 2 days for deck, video and submission. That is tight; the gate and cut list exist for that reason. The user's own deck and video work should start by 4 Oct regardless. Open PRs per phase.

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| tesseract.js worker/wasm will not bundle on Next/Vercel | High | **T0 spike first**; fall back to drop or a labelled client-side demo |
| OCR misses faint or stylised attack text | High | Measured in T11; stated as a limitation; optional vision-LLM second opinion later |
| An LLM transcription step is itself injectable | High | Not used as the extractor |
| Zip bomb or malformed file hangs/crashes | High | Bounded inflation, limits, bomb fixtures, clean 400 |
| pdfjs / OCR cold start and time | Med | Small-file caps, page and pixel limits, timeouts, one OCR job at a time, measured on the branch preview |
| DeepSeek cost grows with input size | Med | Images cost no LLM tokens; text sent to the investigator is capped at ~6,000 chars and asserted by a test |
| Real Word run structure defeats the regex extractor | Med | Real Word-saved fixture (T5), run coalescing, documented limits |
| False positives from white-on-dark tables | Med | Skip dark-shaded paragraphs/cells; negative fixtures |
| Over-claiming (modalities, grid) | High | Separate mini-suite; docs say "measured on N"; claim decided at Checkpoint D |
| Schedule squeezes deck and video | High | Gate and cut list; phases ship independently |

## Decisions needed from the user
1. **Approve adding `fflate`** to `packages/firewall-core` (CLAUDE.md requires asking; no zip reader exists and hand-rolling one is riskier).
2. ~~Approve the 512 KB binary cap~~ **Superseded by the user: small files only; the 100 KB cap stays, with a 5-page PDF limit and a 1600 px image limit.**
3. **Images: go or no-go?** Recommended: **go, time-boxed behind the T0 spike**, with a hard cut by 5 Oct. If you would rather protect the schedule, choose no-go and keep Phases 1–3 + 5.
4. **OCR approach:** server-side `tesseract.js` (recommended) vs a vision model. Confirms the choice of a deterministic extractor.
5. **Grid claim:** stay F3 × D2 until image numbers exist, then decide at Checkpoint D.
6. **Create one real Word `.docx` with hidden text** (≈10 min) when Phase 2 reaches T5.
7. **Apply a DB migration** to the demo project (adds `image` to the content-type enum) when T9 lands, via the SQL editor as before.

## Verification (end to end)
`pnpm lint && pnpm typecheck && pnpm test`; `pnpm eval --mode rules_only --split tuning --skip-db` (unchanged at 96.4% / 0.0%); `next build`; Playwright upload specs (own port); production: upload every sample and a real Word file and a real screenshot, confirm the event page shows readable text and evidence and the "what the firewall read" panel, check `/health`.
