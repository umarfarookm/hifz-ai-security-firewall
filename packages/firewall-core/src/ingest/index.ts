import { ingestEmail } from "./email.js";
import { ingestHtml } from "./html.js";
import { ingestJson } from "./json.js";
import { ingestMarkdown } from "./markdown.js";
import { ingestText } from "./text.js";
import type { IngestAdapterMap } from "./types.js";

export const ingestAdapters: IngestAdapterMap = {
  text: ingestText,
  markdown: ingestMarkdown,
  html: ingestHtml,
  email: ingestEmail,
  json: ingestJson,
};

export { ingestText, ingestMarkdown, ingestHtml, ingestEmail, ingestJson };
export type { IngestResult, IngestAdapter, IngestAdapterMap } from "./types.js";
export type { RawEmail } from "./email.js";
