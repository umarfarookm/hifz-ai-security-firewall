import { describe, expect, it } from "vitest";
import { foldForMatching } from "./homoglyph.js";

describe("foldForMatching", () => {
  it("folds Cyrillic look-alikes to their Latin equivalent", () => {
    // "ignore" with Cyrillic о and е substituted for Latin o and e.
    const spoofed = "ignоre рrevіоus"; // uses о (U+043E), and р(U+0440)/і(U+0456)
    const result = foldForMatching(spoofed);
    expect(result.folded).toContain("ignore");
    expect(result.homoglyphCount).toBeGreaterThan(0);
  });

  it("folds Greek look-alikes to their Latin equivalent", () => {
    const spoofed = "prοxy"; // ο U+03BF (omicron) in place of Latin o
    const result = foldForMatching(spoofed);
    expect(result.folded).toBe("proxy");
    expect(result.homoglyphCount).toBe(1);
  });

  it("case-folds and collapses whitespace", () => {
    const result = foldForMatching("  IGNORE   ALL  ");
    expect(result.folded).toBe("ignore all");
  });

  it("reports zero homoglyphCount for plain ASCII", () => {
    const result = foldForMatching("nothing suspicious here");
    expect(result.homoglyphCount).toBe(0);
    expect(result.folded).toBe("nothing suspicious here");
  });
});
