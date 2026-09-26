import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { evalCaseSchema } from "./schema.js";
import type { EvalCase } from "./types.js";

export interface LoadDatasetResult {
  cases: EvalCase[];
  /** One entry per problem found — malformed JSON, a schema violation, or a duplicate caseId. Empty means every file is valid. */
  errors: string[];
}

function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...findJsonlFiles(full));
    } else if (entry.endsWith(".jsonl")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Loads and validates every *.jsonl file under `datasets/attacks/` and
 * `datasets/legitimate/` (docs/architecture/LLD.md §7). Never throws — a
 * malformed line is reported in `errors` with its file and line number, not
 * silently skipped and not a hard failure, so one bad fixture doesn't stop
 * loading the other few hundred (or a caller can choose to treat any error
 * as fatal, e.g. in CI).
 */
export function loadDataset(datasetsDir: string): LoadDatasetResult {
  const cases: EvalCase[] = [];
  const errors: string[] = [];
  const seenIds = new Map<string, string>(); // caseId -> first file:line it was seen at

  const attacksDir = join(datasetsDir, "attacks");
  const legitimateDir = join(datasetsDir, "legitimate");
  const files = [
    ...(existsSync(attacksDir) ? findJsonlFiles(attacksDir) : []),
    ...(existsSync(legitimateDir) ? findJsonlFiles(legitimateDir) : []),
  ].sort();

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");

    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (line.length === 0) return;

      const location = `${file}:${index + 1}`;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        errors.push(`${location}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      const result = evalCaseSchema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
        errors.push(`${location}: ${issues}`);
        return;
      }

      const existing = seenIds.get(result.data.caseId);
      if (existing) {
        errors.push(`${location}: duplicate caseId "${result.data.caseId}" (first seen at ${existing})`);
        return;
      }

      seenIds.set(result.data.caseId, location);
      cases.push(result.data);
    });
  }

  return { cases, errors };
}
