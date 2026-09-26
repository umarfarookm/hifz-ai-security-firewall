import type { NormalizedContent, Signal, Span } from "../types.js";
import { INSTRUCTION_OVERRIDE_RULES } from "./rules/instruction-override.js";
import { ROLE_CHANGE_RULES } from "./rules/role-change.js";
import { detectEncodedInstructions } from "./rules/encoded-instructions.js";
import { escalateSeverity } from "./severity.js";
import type { RegexDetectorRule } from "./types.js";

const REGEX_RULES: RegexDetectorRule[] = [...INSTRUCTION_OVERRIDE_RULES, ...ROLE_CHANGE_RULES];

const EXCERPT_MAX_LENGTH = 200;

interface LayerText {
  text: string;
  layer: Span["layer"];
}

function collectLayers(normalized: NormalizedContent): LayerText[] {
  const layers: LayerText[] = [{ text: normalized.visibleText, layer: "visible" }];
  for (const segment of normalized.hiddenSegments) layers.push({ text: segment.excerpt, layer: "hidden" });
  for (const decodedLayer of normalized.decodedLayers) layers.push({ text: decodedLayer.text, layer: "decoded" });
  return layers;
}

function runRuleOnLayer(rule: RegexDetectorRule, layer: LayerText): Signal | null {
  const matches = [...layer.text.matchAll(rule.pattern)];
  if (matches.length === 0) return null;

  const evidence: Span[] = matches.map((match) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const excerpt = match[0].length > EXCERPT_MAX_LENGTH ? match[0].slice(0, EXCERPT_MAX_LENGTH) : match[0];
    return { start, end, excerpt, layer: layer.layer };
  });

  const severity = layer.layer === "decoded" ? escalateSeverity(rule.severity) : rule.severity;

  return { detectorId: rule.id, attackType: rule.attackType, severity, confidence: rule.confidence, evidence };
}

/**
 * Stage ③ Detect (docs/architecture/LLD.md §3.3). Runs every pattern-based
 * rule against every layer — visible text, each hidden segment, each
 * decoded layer — plus the standalone encoded-instructions check. A rule
 * that matches inside a decoded layer has its severity raised one level
 * (§3.3, "any detector firing on a decoded layer").
 */
export function runDetectors(normalized: NormalizedContent): Signal[] {
  const layers = collectLayers(normalized);
  const signals: Signal[] = [];

  for (const rule of REGEX_RULES) {
    for (const layer of layers) {
      const signal = runRuleOnLayer(rule, layer);
      if (signal) signals.push(signal);
    }
  }

  signals.push(...detectEncodedInstructions(normalized));

  return signals;
}
