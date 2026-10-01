import { describe, expect, it } from "vitest";
import { bandRows, percent, relativeTime } from "./dashboard.js";

describe("bandRows", () => {
  it("returns the four bands in low-to-critical order with each band's share of the total", () => {
    const rows = bandRows({ LOW: 10, MEDIUM: 5, HIGH: 20, CRITICAL: 15 });
    expect(rows.map((r) => r.band)).toEqual(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
    expect(rows.map((r) => r.count)).toEqual([10, 5, 20, 15]);
    expect(rows.map((r) => r.share)).toEqual([0.2, 0.1, 0.4, 0.3]);
  });

  it("keeps all four rows and reports zero shares (no NaN) when there are no inspections", () => {
    const rows = bandRows({ LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.share === 0 && Number.isFinite(r.share))).toBe(true);
  });

  it("shares always add up to 1 when there is data", () => {
    const sum = bandRows({ LOW: 3, MEDIUM: 7, HIGH: 11, CRITICAL: 13 }).reduce((s, r) => s + r.share, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("describes the age of an event at a glance", () => {
    expect(relativeTime(ago(10_000), now)).toBe("just now");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5m ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3h ago");
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe("2d ago");
  });

  it("never goes negative for a timestamp slightly in the future (clock skew)", () => {
    expect(relativeTime(new Date(now + 5_000).toISOString(), now)).toBe("just now");
  });
});

describe("percent", () => {
  it("formats a fraction", () => {
    expect(percent(0.4)).toBe("40%");
    expect(percent(0.794, 1)).toBe("79.4%");
    expect(percent(0)).toBe("0%");
  });
});
