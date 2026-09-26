export { normalize } from "./normalize.js";
export { toNfkc, stripZeroWidthAndBidi } from "./unicode.js";
export type { StripResult } from "./unicode.js";
export { foldForMatching } from "./homoglyph.js";
export type { FoldResult } from "./homoglyph.js";
export { recursivelyDecode, MAX_DECODE_DEPTH, MAX_DECODED_BYTES } from "./decode.js";
export type { DecodeBudget, DecodeOutcome } from "./decode.js";
