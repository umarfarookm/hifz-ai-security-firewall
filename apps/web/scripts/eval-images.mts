// Image mini-suite (rules-only): OCR each image in datasets/images, run the text through the pipeline, report on its own.
// Run: pnpm eval:images        (a separate suite: never merged into the held-out set, detectors are never tuned on it)
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalize, runDetectors, runPolicy, scoreRisk, type PolicyAction } from "@hifz/firewall-core";
import { runEscalation } from "@hifz/agents";
import { ingestImage } from "../lib/ocr-image.js";

interface Row {
  id: string;
  label: "attack" | "legitimate";
  category: string;
  text: string;
  styleName: string;
  file: string;
}

const root = path.resolve(import.meta.dirname, "../../..");
// The OCR adapter finds its model files relative to the web app, as it does on the server.
process.chdir(path.join(root, "apps/web"));
const dir = path.join(root, "datasets/images");
const rows: Row[] = readFileSync(path.join(dir, "manifest.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Row);

async function decide(text: string): Promise<{ action: PolicyAction; score: number }> {
  const normalized = normalize({ visibleText: text, hiddenSegments: [] });
  const signals = runDetectors(normalized);
  const risk = scoreRisk({ signals, sourceTrust: "untrusted", sessionRisk: 0 });
  // Rules only: no gateway, the same as INVESTIGATOR_PROVIDER=none (and the held-out rules_only mode).
  const escalation = await runEscalation({
    riskAssessment: risk,
    escalationBand: { min: 20, max: 70 },
    gateway: null,
    failureMode: "review",
    investigatorRequest: {
      content: normalized.visibleText,
      tools: { decode: () => ({ encoding: null, decoded: null }), rescan: () => ({ signals: [] }), getSessionHistory: async () => [], getSourceProfile: async () => ({ trust: "untrusted", priorIncidentCount: 0 }) },
      detectorVersion: "images",
      timeoutMs: 1000,
      temperature: 0,
      maxRetries: 0,
    },
  });
  const policy = runPolicy({ finalBand: escalation.finalBand, sourceTrust: "untrusted", failSafeAction: escalation.failSafeAction, normalized, signals });
  return { action: policy.action, score: risk.score };
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
/** Share of the true text's words that OCR got exactly right (multiset match). */
function wordRecall(truth: string, ocr: string): number {
  const bag = new Map<string, number>();
  for (const w of words(ocr)) bag.set(w, (bag.get(w) ?? 0) + 1);
  const t = words(truth);
  let hit = 0;
  for (const w of t) {
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      hit++;
      bag.set(w, n - 1);
    }
  }
  return t.length ? hit / t.length : 1;
}

const results = [];
for (const r of rows) {
  const ocr = (await ingestImage(readFileSync(path.join(dir, r.file)).toString("base64"))).visibleText;
  const viaOcr = await decide(ocr);
  const viaTruth = await decide(r.text);
  results.push({ ...r, ocrText: ocr, recall: wordRecall(r.text, ocr), ocrAction: viaOcr.action, ocrScore: viaOcr.score, truthAction: viaTruth.action, truthScore: viaTruth.score });
}

const attacks = results.filter((r) => r.label === "attack");
const legit = results.filter((r) => r.label === "legitimate");
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}% (${n}/${d})` : "n/a");
const flagged = (a: PolicyAction) => a !== "ALLOW";
const summary = {
  cases: results.length,
  attacks: attacks.length,
  legitimate: legit.length,
  detectionViaOcr: pct(attacks.filter((r) => flagged(r.ocrAction)).length, attacks.length),
  detectionOnPerfectText: pct(attacks.filter((r) => flagged(r.truthAction)).length, attacks.length),
  falsePositiveViaOcr: pct(legit.filter((r) => flagged(r.ocrAction)).length, legit.length),
  falsePositiveOnPerfectText: pct(legit.filter((r) => flagged(r.truthAction)).length, legit.length),
  meanWordRecall: `${((100 * results.reduce((s, r) => s + r.recall, 0)) / results.length).toFixed(1)}%`,
  perCategory: Object.fromEntries(
    [...new Set(attacks.map((a) => a.category))].map((c) => {
      const g = attacks.filter((a) => a.category === c);
      return [c, { viaOcr: `${g.filter((r) => flagged(r.ocrAction)).length}/${g.length}`, perfectText: `${g.filter((r) => flagged(r.truthAction)).length}/${g.length}` }];
    }),
  ),
};

// What to read first: attacks missed via OCR, split into "OCR damaged the text" and "the rules miss it even on perfect text".
const missed = attacks.filter((r) => !flagged(r.ocrAction)).map((r) => ({
  id: r.id, category: r.category, style: r.styleName, recall: Number(r.recall.toFixed(2)), cause: flagged(r.truthAction) ? "OCR error" : "rules miss it even on perfect text", ocrText: r.ocrText.replace(/\s+/g, " "),
}));
const falsePositives = legit.filter((r) => flagged(r.ocrAction)).map((r) => ({ id: r.id, style: r.styleName, ocrAction: r.ocrAction, truthAction: r.truthAction, ocrText: r.ocrText.replace(/\s+/g, " ") }));

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(path.join(root, "eval-reports"), { recursive: true });
const out = path.join(root, "eval-reports", `images-rules_only-${stamp}.json`);
writeFileSync(out, JSON.stringify({ suite: "images", mode: "rules_only", generatedAt: new Date().toISOString(), summary, missed, falsePositives, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log("\nMISSED ATTACKS:\n" + (missed.length ? missed.map((m) => `  ${m.id} [${m.category}, ${m.style}] recall ${m.recall} - ${m.cause}\n    OCR: ${m.ocrText.slice(0, 110)}`).join("\n") : "  none"));
console.log("\nFALSE POSITIVES:\n" + (falsePositives.length ? falsePositives.map((f) => `  ${f.id} [${f.style}] ${f.ocrAction} (perfect text: ${f.truthAction})\n    OCR: ${f.ocrText.slice(0, 110)}`).join("\n") : "  none"));
console.log(`\nreport: ${path.relative(root, out)}`);
process.exit(0);
