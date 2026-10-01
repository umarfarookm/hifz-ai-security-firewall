import type { MetricsBody } from "./metrics.js";

export const BAND_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Band = (typeof BAND_ORDER)[number];

export interface BandRow {
  band: Band;
  count: number;
  /** Fraction of all inspections, 0..1. 0 when there are none. */
  share: number;
}

/** One row per band, always in low-to-critical order, so a band's position carries its meaning and a filter can never reorder it. */
export function bandRows(byBand: MetricsBody["counters"]["byBand"]): BandRow[] {
  const total = BAND_ORDER.reduce((sum, band) => sum + byBand[band], 0);
  return BAND_ORDER.map((band) => ({ band, count: byBand[band], share: total === 0 ? 0 : byBand[band] / total }));
}

/** "just now", "5m ago", "3h ago", "2d ago" — a glanceable age for the latest-events table. */
export function relativeTime(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function percent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}
