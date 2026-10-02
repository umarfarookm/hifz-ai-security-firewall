import { createRequire } from "node:module";
import { IngestError, type MapIngestAdapter } from "./types.js";

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

// pdfjs-dist normally loads its worker script from a file path (GlobalWorkerOptions.workerSrc). That cannot work once a
// bundler has packed this module: webpack rewrites `require.resolve(...)` into a numeric module id, so on Vercel pdfjs
// got `workerSrc = 46094` and failed with "Setting up fake worker failed: e.endsWith is not a function" (every PDF
// upload answered 503). Instead, hand pdfjs the worker's message handler directly. Because it is a plain static
// require, the bundler includes the worker file in the function and no path lookup is needed. workerSrc stays set only
// to satisfy pdfjs's own check; it is never loaded when a handler is already present.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = require("pdfjs-dist/legacy/build/pdf.worker.js");
pdfjsLib.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.js";

/** Demo inputs are small by design (cost and latency): a longer document is rejected, not truncated. */
export const MAX_PDF_PAGES = 5;
const PDF_PARSE_TIMEOUT_MS = 10_000;

export const ingestPdf: MapIngestAdapter = async (raw) => {
  const bytes = Buffer.from(raw, "base64");
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new IngestError("The file is not a PDF (missing the %PDF header).");
  }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IngestError("The PDF took too long to read.")), PDF_PARSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([extractText(bytes), timeout]);
  } catch (err) {
    if (err instanceof IngestError) throw err;
    // The caller only sees a generic message; keep the cause in the server log (message only, never the content).
    console.error("pdf ingest failed:", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    throw new IngestError("The PDF could not be read (it may be corrupt or encrypted).");
  } finally {
    clearTimeout(timer);
  }
};

async function extractText(bytes: Buffer) {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: 0, // only affects pdfjs's own console warnings (e.g. missing font-rendering assets we don't need for text extraction) — not extraction correctness
  }).promise;
  try {
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new IngestError(`The PDF has ${doc.numPages} pages; the demo accepts at most ${MAX_PDF_PAGES}.`);
    }
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
}
