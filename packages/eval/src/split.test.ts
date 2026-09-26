import { describe, expect, it } from "vitest";
import { buildSplitMap, computeSplit } from "./split.js";

describe("computeSplit", () => {
  it("is deterministic — the same caseId always gets the same assignment", () => {
    const first = computeSplit("ovr-own-001");
    for (let i = 0; i < 20; i++) {
      expect(computeSplit("ovr-own-001")).toBe(first);
    }
  });

  it("returns either 'tuning' or 'heldout', never anything else", () => {
    for (const id of ["a", "b", "c", "case-123", "very-different-id"]) {
      expect(["tuning", "heldout"]).toContain(computeSplit(id));
    }
  });

  it("splits roughly 60/40 across a reasonably large sample", () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `case-${i}`);
    const tuningCount = ids.filter((id) => computeSplit(id) === "tuning").length;
    const ratio = tuningCount / ids.length;
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.65);
  });
});

describe("buildSplitMap", () => {
  it("assigns every id exactly once, matching computeSplit", () => {
    const ids = ["a", "b", "c"];
    const map = buildSplitMap(ids);
    expect(Object.keys(map).sort()).toEqual(["a", "b", "c"]);
    for (const id of ids) expect(map[id]).toBe(computeSplit(id));
  });
});
