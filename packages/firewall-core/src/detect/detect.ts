import type { NormalizedContent, Signal, Span } from "../types.js";
import { foldHomoglyphsOnly } from "../normalize/homoglyph.js";
import { INSTRUCTION_OVERRIDE_RULES } from "./rules/instruction-override.js";
import { ROLE_CHANGE_RULES } from "./rules/role-change.js";
import { SECRET_EXTRACTION_RULES } from "./rules/secret-extraction.js";
import { TOOL_ABUSE_RULES } from "./rules/tool-abuse.js";
import { CREDENTIAL_THEFT_RULES } from "./rules/credential-theft.js";
import { INDIRECT_INJECTION_RULES } from "./rules/indirect-injection.js";
import { detectDecodeLimitAnomalies, detectEncodedInstructions } from "./rules/encoded-instructions.js";
import { escalateSeverity } from "./severity.js";
import type { RegexDetectorRule } from "./types.js";

const REGEX_RULES: RegexDetectorRule[] = [
  ...INSTRUCTION_OVERRIDE_RULES,
  ...ROLE_CHANGE_RULES,
  ...SECRET_EXTRACTION_RULES,
  ...TOOL_ABUSE_RULES,
  ...CREDENTIAL_THEFT_RULES,
  ...INDIRECT_INJECTION_RULES,
];

const IND_002_SEVERITY = "medium" as const;
const IND_002_CONFIDENCE = 0.6;

/**
 * IND-002 (docs/architecture/LLD.md §3.3: "any detector firing on a hidden
 * segment" counts toward Indirect Injection coverage). Any signal already
 * found on a hidden segment — regardless of its own attackType — is itself
 * evidence of indirect injection: untrusted content trying to reach the
 * agent through a channel the user never sees. Skips signals that are
 * already indirect_prompt_injection to avoid a signal spawning a near-
 * duplicate of itself.
 */
function detectIndirectInjectionFromHiddenSignals(signals: Signal[]): Signal[] {
  return signals
    .filter((s) => s.attackType !== "indirect_prompt_injection")
    .flatMap((s) => {
      const hiddenEvidence = s.evidence.filter((span) => span.layer === "hidden");
      if (hiddenEvidence.length === 0) return [];
      return [
        {
          detectorId: "IND-002",
          attackType: "indirect_prompt_injection" as const,
          severity: IND_002_SEVERITY,
          confidence: IND_002_CONFIDENCE,
          evidence: hiddenEvidence,
        },
      ];
    });
}

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
  // Match against the homoglyph-folded text (docs/architecture/LLD.md §3.2
  // steps 3-4) so a Cyrillic/Greek look-alike substitution can't evade a
  // rule by looking different from the Latin pattern it's spelling out.
  // foldHomoglyphsOnly is a strict 1:1 character substitution, so offsets
  // into the folded text are valid offsets into the original — the excerpt
  // below is sliced from the original so evidence shows the real
  // (possibly spoofed) characters, not the folded ones.
  const { folded } = foldHomoglyphsOnly(layer.text);
  const matches = [...folded.matchAll(rule.pattern)];
  if (matches.length === 0) return null;

  const evidence: Span[] = matches.map((match) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const rawMatch = layer.text.slice(start, end);
    const excerpt = rawMatch.length > EXCERPT_MAX_LENGTH ? rawMatch.slice(0, EXCERPT_MAX_LENGTH) : rawMatch;
    return { start, end, excerpt, layer: layer.layer };
  });

  const severity = layer.layer === "decoded" ? escalateSeverity(rule.severity) : rule.severity;

  return { detectorId: rule.id, attackType: rule.attackType, severity, confidence: rule.confidence, evidence };
}

/**
 * Stage ③ Detect (docs/architecture/LLD.md §3.3). Runs every pattern-based
 * rule (instruction override, role change, secret extraction, tool abuse,
 * credential theft, indirect injection) against every layer — visible
 * text, each hidden segment, each decoded layer — plus the standalone
 * encoded-instructions (ENC-001), decode-limit-anomaly (ENC-002), and
 * hidden-segment (IND-002) checks. A rule that matches inside a decoded
 * layer has its severity raised one level (§3.3, "any detector firing on
 * a decoded layer").
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
  signals.push(...detectDecodeLimitAnomalies(normalized));
  signals.push(...detectIndirectInjectionFromHiddenSignals(signals));

  return signals;
}
