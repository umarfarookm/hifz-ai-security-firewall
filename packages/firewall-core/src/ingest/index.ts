import { ingestEmail } from "./email.js";
import { ingestHtml } from "./html.js";
import { ingestJson } from "./json.js";
import { ingestMarkdown } from "./markdown.js";
import { ingestPdf } from "./pdf.js";
import { ingestSourceCode } from "./source-code.js";
import { ingestText } from "./text.js";
import type { IngestAdapterMap } from "./types.js";

export const ingestAdapters: IngestAdapterMap = {
  text: ingestText,
  markdown: ingestMarkdown,
  html: ingestHtml,
  email: ingestEmail,
  json: ingestJson,
  source_code: ingestSourceCode,
  pdf: ingestPdf,
};

export { ingestText, ingestMarkdown, ingestHtml, ingestEmail, ingestJson, ingestSourceCode, ingestPdf };
export type { IngestResult, IngestAdapter, MapIngestAdapter, IngestAdapterMap } from "./types.js";
export type { RawEmail } from "./email.js";
