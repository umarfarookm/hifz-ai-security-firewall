import type { Span } from "../types.js";
import { locateSpan } from "./span-locator.js";
import type { IngestAdapter } from "./types.js";

const STRING_LITERAL_PATTERN = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_PATTERN = /(?:\/\/|#).*$/gm;

/**
 * source_code adapter (docs/architecture/LLD.md §3.1, P1): full text, with
 * comments and string literals extracted as separate hidden segments —
 * not executed, but read by coding agents (a docstring or a log string is
 * exactly as "read but not run" as a comment is), so worth scanning as
 * untrusted content in its own right rather than folded into the bulk
 * visible text. [ASSUMPTION] LLD's own wording only explicitly calls
 * comments "hidden segments"; string literals are treated the same way
 * here for the same underlying reason, since `Span` has no third category
 * to put them in and no line-number field — offsets are character offsets
 * into the raw source, same as every other adapter.
 *
 * Language-agnostic and regex-based — covers `//`, `#`, and `/* *\/`
 * comments and single/double/backtick-quoted strings, which spans most
 * mainstream languages but isn't a real parser. A comment/string syntax
 * outside that set (e.g. Lisp's `;`) won't be recognized — same
 * "lightweight, not spec-complete" tradeoff the Markdown adapter takes.
 */
export const ingestSourceCode: IngestAdapter = (raw) => {
  const hiddenSegments: Span[] = [];
  let working = raw;
  let stringCursor = 0;
  let blockCommentCursor = 0;
  let lineCommentCursor = 0;

  // String literals extracted first, and blanked (not deleted) so an
  // embedded "//" or "#" inside a string doesn't get misread as a comment
  // by the later passes. Blanking preserves newlines so line-anchored
  // regexes below still see the same line structure as the raw source.
  working = working.replace(STRING_LITERAL_PATTERN, (match) => {
    const { span, nextIndex } = locateSpan(raw, match, "hidden", stringCursor);
    stringCursor = nextIndex;
    const inner = match.slice(1, -1).trim();
    if (inner.length > 0) hiddenSegments.push({ ...span, excerpt: truncate(inner) });
    return blank(match);
  });

  working = working.replace(BLOCK_COMMENT_PATTERN, (match) => {
    const { span, nextIndex } = locateSpan(raw, match, "hidden", blockCommentCursor);
    blockCommentCursor = nextIndex;
    const inner = match.slice(2, -2).trim();
    if (inner.length > 0) hiddenSegments.push({ ...span, excerpt: truncate(inner) });
    return blank(match);
  });

  working = working.replace(LINE_COMMENT_PATTERN, (match) => {
    const { span, nextIndex } = locateSpan(raw, match, "hidden", lineCommentCursor);
    lineCommentCursor = nextIndex;
    const inner = match.replace(/^(?:\/\/|#)/, "").trim();
    if (inner.length > 0) hiddenSegments.push({ ...span, excerpt: truncate(inner) });
    return "";
  });

  return { visibleText: working.replace(/\n{3,}/g, "\n\n").trim(), hiddenSegments };
};

function blank(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

function truncate(text: string): string {
  return text.length > 200 ? text.slice(0, 200) : text;
}
