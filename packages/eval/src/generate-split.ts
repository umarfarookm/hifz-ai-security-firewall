#!/usr/bin/env node
/**
 * Regenerates datasets/splits/split.json from whatever's currently in
 * datasets/attacks/ and datasets/legitimate/. Run this after adding or
 * removing cases — never hand-edit split.json.
 *
 * Usage: pnpm --filter @hifz/eval run generate-split
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDataset } from "./loader.js";
import { buildSplitMap } from "./split.js";

const datasetsDir = join(import.meta.dirname, "../../../datasets");

function main(): void {
  const { cases, errors } = loadDataset(datasetsDir);

  if (errors.length > 0) {
    console.error(`[generate-split] refusing to write a split file — ${errors.length} dataset error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  const splitMap = buildSplitMap(cases.map((c) => c.caseId));
  const tuningCount = Object.values(splitMap).filter((v) => v === "tuning").length;
  const heldoutCount = Object.values(splitMap).filter((v) => v === "heldout").length;

  const outPath = join(datasetsDir, "splits", "split.json");
  writeFileSync(outPath, `${JSON.stringify(splitMap, null, 2)}\n`, "utf8");

  console.log(`[generate-split] wrote ${outPath}`);
  console.log(`[generate-split] ${cases.length} cases total — ${tuningCount} tuning, ${heldoutCount} heldout`);
}

main();
