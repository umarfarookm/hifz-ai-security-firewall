import type { RiskBand } from "./types.js";

const BAND_ORDER: RiskBand[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function bandAtLeast(band: RiskBand, min: RiskBand): boolean {
  return BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(min);
}
