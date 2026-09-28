import type { GuardCheckResult, GuardDecision, RiskBand, ToolCallRequest } from "@hifz/firewall-core";
import { TOOL_REGISTRY } from "./tools-registry.js";

const BAND_ORDER: RiskBand[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function bandAtLeast(band: RiskBand, min: RiskBand): boolean {
  return BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(min);
}

function highestBand(bands: RiskBand[]): RiskBand {
  return bands.reduce((max, b) => (BAND_ORDER.indexOf(b) > BAND_ORDER.indexOf(max) ? b : max), "LOW" as RiskBand);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAllowlist(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`, "i");
    return regex.test(value);
  });
}

// Recognizable shapes of real secrets/tokens, independent of the known-secrets list —
// catches a credential the model paraphrased or partially transformed.
const SECRET_LIKE_PATTERN =
  /\b(sk-[A-Za-z0-9]{10,}|AKIA[A-Z0-9]{12,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._-]{10,}|[A-Za-z0-9+/]{32,}={0,2})\b/;

function findLeakedSecret(args: Record<string, unknown>, knownSecrets: string[]): string | null {
  for (const value of Object.values(args)) {
    if (typeof value !== "string") continue;
    if (knownSecrets.some((secret) => secret.length > 0 && value.includes(secret))) return value;
    const match = SECRET_LIKE_PATTERN.exec(value);
    if (match) return match[0];
  }
  return null;
}

export interface ActionGuardContext {
  /** Risk bands of the content that led to this proposed call — resolved by the caller (e.g. from the inspections table). */
  triggeringBands: RiskBand[];
  /** Whether any triggering content came from an untrusted source. */
  anyTriggeringContentUntrusted: boolean;
  /** High-risk (non-"low") tool calls this session made in the last 5 minutes — resolved by the caller. */
  recentHighRiskCallCount: number;
  /** Real values to scan for in outbound tool args (from a fake-secrets registry — never real credentials). */
  knownSecrets: string[];
}

/**
 * Stage ⑧ Action Guard (docs/architecture/LLD.md §3.9). Checks run in
 * order; the first failure decides the outcome — everything after it is
 * skipped, matching "first failure decides" in the spec.
 *
 * read_secrets' special rule from §3.8 ("BLOCK unless explicitly
 * requested and no untrusted content is in context") isn't a separate
 * check — it falls out of G5 automatically: read_secrets is "critical"
 * risk class, so any untrusted-source taint on this call already forces
 * BLOCK there. No bespoke rule needed. [DECISION]
 */
export function runActionGuard(request: ToolCallRequest, context: ActionGuardContext): GuardDecision {
  const checks: GuardCheckResult[] = [];

  const tool = TOOL_REGISTRY[request.tool];
  const g1Passed = Boolean(tool);
  checks.push({ checkId: "G1", passed: g1Passed, detail: g1Passed ? "tool is on the allowlist" : `unknown tool "${request.tool}"` });
  if (!tool) {
    return { outcome: "BLOCK", checks, reason: "G1: tool is not on the allowlist", reviewId: null };
  }

  const parseResult = tool.parametersSchema.safeParse(request.args);
  checks.push({
    checkId: "G2",
    passed: parseResult.success,
    detail: parseResult.success ? "arguments match the tool's parameter schema" : parseResult.error.issues.map((i) => i.message).join("; "),
  });
  if (!parseResult.success) {
    return { outcome: "BLOCK", checks, reason: "G2: arguments do not match the tool's parameter schema", reviewId: null };
  }

  if (tool.destinationField && tool.destinationAllowlist) {
    const destination = String(request.args[tool.destinationField] ?? "");
    const allowed = matchesAllowlist(destination, tool.destinationAllowlist);
    checks.push({
      checkId: "G3",
      passed: allowed,
      detail: allowed ? `destination "${destination}" is on the allowlist` : `destination "${destination}" is not on the allowlist`,
    });
    if (!allowed) {
      return { outcome: "REQUIRE_APPROVAL", checks, reason: "G3: destination is not on the allowlist", reviewId: null };
    }
  } else {
    checks.push({ checkId: "G3", passed: true, detail: "no destination restriction applies to this tool" });
  }

  const leakedSecret = findLeakedSecret(request.args, context.knownSecrets);
  checks.push({
    checkId: "G4",
    passed: !leakedSecret,
    detail: leakedSecret ? "outbound arguments contain a secret-shaped value" : "no secret-shaped values found in outbound arguments",
  });
  if (leakedSecret) {
    return { outcome: "BLOCK", checks, reason: "G4: outbound secret scan failed", reviewId: null };
  }

  // [DECISION] The LLD's G5 wording ("finalBand ≥ MEDIUM, or untrusted source
  // and risk class high/critical") is ambiguous about whether the band-only
  // clause applies to low-risk tools too — but the outcome column only
  // defines behavior for high/critical. Resolved here: G5 only has teeth for
  // non-low-risk tools. Reading or summarizing risky content isn't itself a
  // consequential action worth blocking; only send_email/read_secrets-style
  // actions are.
  const worstBand = highestBand(context.triggeringBands);
  const tainted = tool.riskClass !== "low" && (bandAtLeast(worstBand, "MEDIUM") || context.anyTriggeringContentUntrusted);
  checks.push({
    checkId: "G5",
    passed: !tainted,
    detail: tainted
      ? `triggering content band ${worstBand}${context.anyTriggeringContentUntrusted ? ", from an untrusted source" : ""}`
      : "triggering content is clean or this tool is low-risk",
  });
  if (tainted) {
    const outcome = tool.riskClass === "critical" ? "BLOCK" : "REQUIRE_APPROVAL";
    return { outcome, checks, reason: "G5: taint check failed", reviewId: null };
  }

  // [DECISION] context.recentHighRiskCallCount counts calls strictly before
  // this one. "More than 3 per 5 min" reads most naturally as a cap of 3
  // allowed, so the 4th call in the window is the one that gets rate
  // limited — i.e. trip as soon as 3 have already happened, not 4.
  const rateLimited = tool.riskClass !== "low" && context.recentHighRiskCallCount >= 3;
  checks.push({
    checkId: "G6",
    passed: !rateLimited,
    detail: rateLimited
      ? `${context.recentHighRiskCallCount} high-risk calls in the last 5 minutes`
      : "within the per-session high-risk rate limit",
  });
  if (rateLimited) {
    return { outcome: "REQUIRE_APPROVAL", checks, reason: "G6: per-session high-risk rate limit exceeded", reviewId: null };
  }

  return { outcome: "EXECUTE", checks, reason: "all checks passed", reviewId: null };
}
