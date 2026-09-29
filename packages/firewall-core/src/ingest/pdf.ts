import { createRequire } from "node:module";
import type { MapIngestAdapter } from "./types.js";

/**
 * pdf adapter (docs/architecture/LLD.md §3.1, P1): text layer only, no
 * OCR — matches the "[DECISION] No D3 claim" scope (HLD §1). `raw` is the
 * PDF's bytes, base64-encoded, since /inspect's `content` field is a JSON
 * string and PDFs are binary.
 *
 * No hidden-text sources are captured for PDFs (LLD §3.1's pdf row lists
 * none) — this is genuinely just "extract the text and scan it."
 *
 * [DECISION] Uses pdfjs-dist's legacy Node build directly, not the
 * "pdf-parse" wrapper package (two attempts, both real bugs found only by
 * actually running this, not from unit tests):
 *   - pdf-parse v2 wraps pdfjs-dist as ESM, which fails to load under
 *     Next.js's webpack bundling for server routes even with
 *     `serverExternalPackages` set ("Object.defineProperty called on
 *     non-object").
 *   - pdf-parse v1's bundled pdf.js (a ~2018 build) has a real
 *     reproducible race in its lazy internal init: the first several
 *     `pdfParse()` calls in a fresh process reliably fail — with a
 *     different error each time on byte-identical input — before
 *     stabilizing anywhere from ~5 to ~12 calls in. No fixed retry count
 *     was reliable. On Vercel this would break a user's first PDF on
 *     every cold start.
 * pdfjs-dist's own legacy/build/pdf.js, called directly via `getDocument`
 * + `getTextContent` (the same API pdf-parse itself wraps), has shown no
 * such issue in repeated fresh-process testing. `createRequire` is used
 * instead of a static import because the package's CJS/ESM interop is
 * inconsistent under a plain `import` (some exports land on the module
 * namespace, others only on a synthetic `.default`) — `require()` returns
 * the flat, correctly-shaped object the type declarations describe.
 */
const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist/legacy/build/pdf.js");

// pdfjs-dist's own internal relative-path lookup for its worker script
// breaks once webpack bundles the calling code (Next.js server routes) —
// resolving it here, from our own module, gives it a real filesystem path
// that works regardless of how the caller got bundled.
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");

export const ingestPdf: MapIngestAdapter = async (raw) => {
  const bytes = Buffer.from(raw, "base64");
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: 0, // only affects pdfjs's own console warnings (e.g. missing font-rendering assets we don't need for text extraction) — not extraction correctness
  }).promise;
  try {
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return { visibleText: pageTexts.join("\n"), hiddenSegments: [] };
  } finally {
    await doc.destroy();
  }
};
