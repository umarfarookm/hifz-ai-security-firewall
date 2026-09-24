import type { Span } from "../types.js";
import { locateSpan } from "./span-locator.js";
import type { IngestAdapter } from "./types.js";

const HTML_COMMENT = /<!--([\s\S]*?)-->/g;
const REFERENCE_DEFINITION = /^[ \t]*\[([^\]]+)\]:[ \t]*(\S+)(?:[ \t]+["'(](.*?)["')])?[ \t]*$/gm;
const IMAGE = /!\[([^\]]*)\]\(([^)]*)\)/g;
const LINK_WITH_TITLE = /\[([^\]]+)\]\(([^)"']+)(?:[ \t]+["']([^"']*)["'])?\)/g;

/**
 * Renders Markdown to plain text while pulling out everything a reader
 * wouldn't actually see: HTML comments, reference-link definitions, image
 * alt text, and link titles. See docs/architecture/LLD.md §3.1.
 *
 * This is a lightweight, regex-based renderer — good enough for detectors
 * that match phrases, not a spec-complete CommonMark implementation.
 */
export const ingestMarkdown: IngestAdapter = (raw) => {
  const hiddenSegments: Span[] = [];
  let cursor = 0;
  let working = raw;

  working = working.replace(HTML_COMMENT, (match, inner: string) => {
    const { span, nextIndex } = locateSpan(raw, match, "hidden", cursor);
    cursor = nextIndex;
    if (inner.trim().length > 0) hiddenSegments.push({ ...span, excerpt: truncate(inner.trim()) });
    return "";
  });

  working = working.replace(REFERENCE_DEFINITION, (match, _label: string, _url: string, title?: string) => {
    const { span, nextIndex } = locateSpan(raw, match, "hidden", cursor);
    cursor = nextIndex;
    hiddenSegments.push({ ...span, excerpt: truncate(title ?? match.trim()) });
    return "";
  });

  working = working.replace(IMAGE, (match, alt: string) => {
    const { span, nextIndex } = locateSpan(raw, match, "hidden", cursor);
    cursor = nextIndex;
    if (alt.trim().length > 0) hiddenSegments.push({ ...span, excerpt: truncate(alt.trim()) });
    return "";
  });

  working = working.replace(LINK_WITH_TITLE, (match, text: string, _url: string, title?: string) => {
    if (title && title.trim().length > 0) {
      const { span, nextIndex } = locateSpan(raw, match, "hidden", cursor);
      cursor = nextIndex;
      hiddenSegments.push({ ...span, excerpt: truncate(title.trim()) });
    }
    return text;
  });

  const visibleText = working
    .replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/(\*\*\*|\*\*|\*|___|__|_)/g, "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { visibleText, hiddenSegments };
};

function truncate(text: string): string {
  return text.length > 200 ? text.slice(0, 200) : text;
}
