import { describe, expect, it } from "vitest";
import { stripZeroWidthAndBidi, toNfkc } from "./unicode.js";

describe("toNfkc", () => {
  it("normalizes full-width characters to their standard form", () => {
    // Full-width Latin "IGNORE" (U+FF29 etc.) — a real obfuscation trick to dodge naive string matching.
    expect(toNfkc("ＩＧＮＯＲＥ")).toBe("IGNORE");
  });

  it("normalizes compatibility ligatures", () => {
    expect(toNfkc("ﬁ")).toBe("fi"); // the "fi" ligature character
  });

  it("leaves already-normalized text unchanged", () => {
    expect(toNfkc("plain ascii text")).toBe("plain ascii text");
  });
});

describe("stripZeroWidthAndBidi", () => {
  it("removes zero-width characters and counts them", () => {
    const result = stripZeroWidthAndBidi("ig​no‌re");
    expect(result.text).toBe("ignore");
    expect(result.strippedCount).toBe(2);
  });

  it("removes bidi control characters", () => {
    const result = stripZeroWidthAndBidi("a‮b‬c");
    expect(result.text).toBe("abc");
    expect(result.strippedCount).toBe(2);
  });

  it("reports zero strippedCount when there's nothing to strip", () => {
    const result = stripZeroWidthAndBidi("clean text");
    expect(result.strippedCount).toBe(0);
    expect(result.text).toBe("clean text");
  });
});
