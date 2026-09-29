import pdfParse from "pdf-parse";
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
 * [DECISION] Pinned to pdf-parse v1's classic CJS API rather than v2:
 * v2 wraps pdfjs-dist as ESM, which fails to load under Next.js's webpack
 * bundling for server routes even with `serverExternalPackages` set
 * ("Object.defineProperty called on non-object" — an ESM/CJS interop
 * failure, discovered by actually running this against the dev server,
 * not just unit tests). v1 is plain CJS, no such issue, and is the
 * long-established, widely-deployed-on-Vercel choice for this exact job.
 */
export const ingestPdf: MapIngestAdapter = async (raw) => {
  const bytes = Buffer.from(raw, "base64");
  const result = await pdfParse(bytes);
  return { visibleText: result.text, hiddenSegments: [] };
};
