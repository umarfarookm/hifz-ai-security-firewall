import { unzipSync } from "fflate";
import type { Span } from "../types.js";
import { IngestError, type IngestAdapter } from "./types.js";

/**
 * docx adapter (docs/architecture/LLD.md §3.1): reads a Word document's text and separates what a reader sees from
 * what Word hides — hidden runs, white or tiny text, tracked deletions, comments and footnotes. `raw` is the .docx
 * bytes, base64-encoded.
 *
 * [DECISION] No XML parser: OOXML text lives in a small, regular set of elements (w:p, w:r, w:rPr, w:t), so a scoped
 * linear extractor is enough and has no DTD or entity-expansion surface. The zip is read with fflate under hard
 * limits (entry count, declared and actual inflated size) because a docx is a zip and zip bombs are the realistic
 * abuse. Known limits: hiding inherited from a style (rather than set on the run) is not seen, and text boxes are
 * read as ordinary runs.
 */
const MAX_ENTRIES = 200;
const MAX_XML_BYTES = 2 * 1024 * 1024;
const CHUNK = 200;
const CHUNK_STEP = 150;

const TEXT_PARTS = ["word/document.xml", "word/comments.xml", "word/footnotes.xml", "word/endnotes.xml"] as const;

export const ingestDocx: IngestAdapter = (raw) => {
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new IngestError("The file is not a Word document (.docx is a zip archive).");
  }
  const parts = readParts(bytes);
  const body = parts.get("word/document.xml");
  if (body === undefined) throw new IngestError("The file is a zip but has no word/document.xml, so it is not a Word document.");

  const out = new Stream();
  extractBody(body, out);
  for (const name of ["word/comments.xml", "word/footnotes.xml", "word/endnotes.xml"] as const) {
    const xml = parts.get(name);
    if (xml !== undefined) extractAllHidden(xml, out);
  }
  return { visibleText: out.visible.join("\n"), hiddenSegments: out.hidden };
};

function readParts(bytes: Buffer): Map<string, string> {
  let entries = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(bytes), {
      filter: (file) => {
        if (++entries > MAX_ENTRIES) throw new IngestError("The document has too many internal files.");
        if (!(TEXT_PARTS as readonly string[]).includes(file.name)) return false;
        if (file.originalSize > MAX_XML_BYTES) throw new IngestError("The document is too large once unpacked.");
        return true;
      },
    });
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError("The Word document could not be read (it may be corrupt or encrypted).");
  }
  const parts = new Map<string, string>();
  for (const [name, data] of Object.entries(files)) {
    // The declared size is attacker-controlled, so check what actually came out as well.
    if (data.length > MAX_XML_BYTES) throw new IngestError("The document is too large once unpacked.");
    parts.set(name, Buffer.from(data).toString("utf8"));
  }
  return parts;
}

/** Accumulates visible lines and hidden segments; offsets index one running full-text stream (visible + hidden). */
class Stream {
  readonly visible: string[] = [];
  readonly hidden: Span[] = [];
  private cursor = 0;

  addVisible(text: string): void {
    this.visible.push(text);
    this.cursor += text.length + 1;
  }

  addHidden(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    // Downstream keeps only 200 characters of a span's excerpt, so long hidden text goes in as overlapping chunks.
    for (let from = 0; from < trimmed.length; from += CHUNK_STEP) {
      const piece = trimmed.slice(from, from + CHUNK);
      this.hidden.push({ start: this.cursor, end: this.cursor + piece.length, excerpt: piece, layer: "hidden" });
      this.cursor += piece.length + 1;
      if (from + CHUNK >= trimmed.length) break;
    }
  }
}

const PARA = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
const RUN = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
const CELL = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;

function extractBody(xml: string, out: Stream): void {
  const darkCells = darkRanges(xml);
  for (const para of xml.matchAll(PARA)) {
    const darkBackground = isDarkShaded(para[1] ?? "") || darkCells.some(([from, to]) => para.index >= from && para.index < to);
    let visible = "";
    let hidden = "";
    for (const run of (para[1] ?? "").matchAll(RUN)) {
      const { text, deleted, props } = readRun(run[1] ?? "");
      if (text.length === 0) continue;
      if (deleted || isHiddenRun(props, darkBackground)) hidden += text;
      else visible += text;
    }
    if (visible.trim().length > 0) out.addVisible(visible);
    out.addHidden(hidden);
  }
}

/** Comments, footnotes and endnotes: nothing in them is part of the page's running text, so all of it is hidden-layer. */
function extractAllHidden(xml: string, out: Stream): void {
  for (const para of xml.matchAll(PARA)) {
    let text = "";
    for (const run of (para[1] ?? "").matchAll(RUN)) text += readRun(run[1] ?? "").text;
    out.addHidden(text);
  }
}

function readRun(inner: string): { text: string; deleted: boolean; props: string } {
  const props = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(inner)?.[1] ?? "";
  let text = "";
  let deleted = false;
  for (const m of inner.matchAll(/<w:(t|delText)(?:\s[^>]*)?>([\s\S]*?)<\/w:\1>|<w:tab\s*\/>|<w:br\s*\/>/g)) {
    if (m[1] === "t") text += decodeEntities(m[2] ?? "");
    else if (m[1] === "delText") {
      deleted = true;
      text += decodeEntities(m[2] ?? "");
    } else text += m[0].startsWith("<w:tab") ? "\t" : "\n";
  }
  return { text, deleted, props };
}

function isHiddenRun(props: string, darkBackground: boolean): boolean {
  const vanish = /<w:vanish(?:\s+w:val="([^"]*)")?\s*\/?>/.exec(props);
  if (vanish && !["0", "false", "off"].includes((vanish[1] ?? "1").toLowerCase())) return true;

  const size = /<w:sz\s+w:val="(\d+)"/.exec(props)?.[1];
  if (size !== undefined && Number(size) <= 2) return true; // 1 pt or smaller

  const color = /<w:color\s+w:val="([0-9A-Fa-f]{6})"/.exec(props)?.[1];
  if (color && isNearWhite(color) && !darkBackground && !isDarkShaded(props)) return true;
  return false;
}

function isNearWhite(hex: string): boolean {
  return [0, 2, 4].every((i) => parseInt(hex.slice(i, i + 2), 16) >= 0xf0);
}

function isDarkShaded(xml: string): boolean {
  const fill = /<w:shd\b[^>]*\bw:fill="([0-9A-Fa-f]{6})"/.exec(xml)?.[1];
  if (!fill) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(fill.slice(i, i + 2), 16)) as [number, number, number];
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

function darkRanges(xml: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const cell of xml.matchAll(CELL)) {
    const tcPr = /<w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(cell[1] ?? "")?.[1] ?? "";
    if (isDarkShaded(tcPr)) ranges.push([cell.index, cell.index + cell[0].length]);
  }
  return ranges;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "amp") return "&";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const code = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}
