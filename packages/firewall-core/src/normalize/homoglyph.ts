/**
 * Stage ②, steps 3–4 of docs/architecture/LLD.md §3.2: fold Cyrillic and
 * Greek look-alikes to their Latin equivalent, then fold whitespace and
 * case — but only on a throwaway copy used for pattern matching, never on
 * the text shown to a human. `foldForMatching` is exported for detectors
 * (task 1.8) to call on any layer's text when scanning for patterns;
 * `normalize()` also calls it internally to detect the `mixed_script`
 * anomaly, but does not persist the folded text anywhere.
 *
 * [ASSUMPTION] This table is deliberately not exhaustive — it covers the
 * Cyrillic and Greek letters most commonly abused in real homoglyph
 * attacks (phishing domains, obfuscated keywords), not the full Unicode
 * confusables list. Extend it if evaluation results show gaps.
 */
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic lowercase → Latin
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
  у: "y",
  і: "i",
  ѕ: "s",
  ј: "j",
  к: "k",
  м: "m",
  н: "h",
  т: "t",
  // Cyrillic uppercase → Latin lowercase (matching copy is case-folded anyway)
  А: "a",
  В: "b",
  Е: "e",
  К: "k",
  М: "m",
  Н: "h",
  О: "o",
  Р: "p",
  С: "c",
  Т: "t",
  У: "y",
  Х: "x",
  // Greek → Latin
  ο: "o",
  ρ: "p",
  υ: "y",
  κ: "k",
  Α: "a",
  Β: "b",
  Ε: "e",
  Ζ: "z",
  Η: "h",
  Ι: "i",
  Κ: "k",
  Μ: "m",
  Ν: "n",
  Ο: "o",
  Ρ: "p",
  Τ: "t",
  Υ: "y",
  Χ: "x",
};

const HOMOGLYPH_PATTERN = new RegExp(`[${Object.keys(HOMOGLYPH_MAP).join("")}]`, "g");

export interface FoldResult {
  folded: string;
  homoglyphCount: number;
}

/**
 * Homoglyph-folds, whitespace-folds, and case-folds `text`. The result is
 * for matching only — it is not fit to display to a human (it discards
 * exactly the visual distinction an attacker is relying on).
 */
export function foldForMatching(text: string): FoldResult {
  let homoglyphCount = 0;
  const homoglyphFolded = text.replace(HOMOGLYPH_PATTERN, (ch) => {
    homoglyphCount++;
    return HOMOGLYPH_MAP[ch]!;
  });

  const folded = homoglyphFolded.replace(/\s+/g, " ").trim().toLowerCase();

  return { folded, homoglyphCount };
}
