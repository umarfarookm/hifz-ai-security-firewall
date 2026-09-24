import { type HTMLElement as ParsedElement, type Node as ParsedNode, NodeType, parse } from "node-html-parser";
import type { Span } from "../types.js";
import { locateSpan } from "./span-locator.js";
import type { IngestAdapter } from "./types.js";

const HIDDEN_STYLE_PATTERN = /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px)?\b/i;

/**
 * Extracts visible text plus every hidden-text source called out in
 * docs/architecture/LLD.md §3.1: HTML comments, display:none /
 * visibility:hidden / font-size:0 (inline styles only), text colour equal
 * to background, aria-hidden, alt/title attributes, <meta> content, and
 * <noscript>. External stylesheets are out of scope — see the known
 * limitations in docs/architecture/LLD.md §12.
 */
export const ingestHtml: IngestAdapter = (raw) => {
  const root = parse(raw, { comment: true });
  const hiddenSegments: Span[] = [];
  const visibleParts: string[] = [];
  let attrCursor = 0;

  const pushHiddenFromAttr = (value: string) => {
    if (value.trim().length === 0) return;
    const { span, nextIndex } = locateSpan(raw, value, "hidden", attrCursor);
    attrCursor = nextIndex;
    hiddenSegments.push({ ...span, excerpt: value.length > 200 ? value.slice(0, 200) : value });
  };

  const spanFromRange = (node: ParsedNode, text: string): Span => {
    const [start, end] = node.range;
    const excerpt = text.length > 200 ? text.slice(0, 200) : text;
    return { start, end, excerpt, layer: "hidden" };
  };

  const isHiddenElement = (el: ParsedElement): boolean => {
    if (el.tagName?.toLowerCase() === "noscript") return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    const style = el.getAttribute("style");
    if (style) {
      if (HIDDEN_STYLE_PATTERN.test(style)) return true;
      const color = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim().toLowerCase();
      const background = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim().toLowerCase();
      if (color && background && color === background) return true;
    }
    return false;
  };

  const walk = (node: ParsedNode) => {
    if (node.nodeType === NodeType.COMMENT_NODE) {
      const text = node.rawText.trim();
      if (text.length > 0) hiddenSegments.push(spanFromRange(node, text));
      return;
    }

    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = node.text;
      if (text.trim().length > 0) visibleParts.push(text);
      return;
    }

    const el = node as ParsedElement;

    if (el.tagName?.toLowerCase() === "meta") {
      const content = el.getAttribute("content");
      if (content) pushHiddenFromAttr(content);
      return;
    }

    if (isHiddenElement(el)) {
      const text = el.text.trim();
      if (text.length > 0) hiddenSegments.push(spanFromRange(el, text));
      return; // don't recurse — the whole subtree is already captured as one segment
    }

    const alt = el.getAttribute("alt");
    if (alt) pushHiddenFromAttr(alt);
    const title = el.getAttribute("title");
    if (title) pushHiddenFromAttr(title);

    for (const child of el.childNodes) walk(child);
  };

  walk(root);

  return {
    visibleText: visibleParts.join(" ").replace(/\s+/g, " ").trim(),
    hiddenSegments,
  };
};
