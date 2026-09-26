/**
 * Stage ②, steps 1–2 of docs/architecture/LLD.md §3.2: Unicode NFKC
 * normalization, then stripping zero-width and bidi-control characters
 * that have no legitimate reason to appear in ordinary text but are a
 * common obfuscation trick (splitting a banned word with zero-width
 * joiners, hiding text with bidi overrides).
 */

// Zero-width: ZWSP, ZWNJ, ZWJ, word joiner, zero-width no-break space (BOM).
const ZERO_WIDTH = "​‌‍⁠﻿";
// Bidi controls: LRM, RLM, the explicit embedding/override pair, and the isolate set.
const BIDI_CONTROL = "‎‏‪-‮⁦-⁩";

const ZERO_WIDTH_OR_BIDI = new RegExp(`[${ZERO_WIDTH}${BIDI_CONTROL}]`, "g");

export function toNfkc(text: string): string {
  return text.normalize("NFKC");
}

export interface StripResult {
  text: string;
  strippedCount: number;
}

export function stripZeroWidthAndBidi(text: string): StripResult {
  let count = 0;
  const stripped = text.replace(ZERO_WIDTH_OR_BIDI, () => {
    count++;
    return "";
  });
  return { text: stripped, strippedCount: count };
}
