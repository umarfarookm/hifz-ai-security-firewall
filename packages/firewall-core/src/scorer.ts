import type { RiskAssessment, RiskBand, ScoreContribution, Signal, TrustLevel } from "./types.js";

/**
 * Implements the scoring formula from docs/architecture/LLD.md §3.4.
 * Every constant here is an initial value — calibrate only on the tuning split
 * and record before/after numbers, per the evaluation rule in docs/architecture/HLD.md §12.
 */

const SEVERITY_BASE: Record<Signal["severity"], number> = {
  low: 20,
  medium: 45,
  high: 70,
  critical: 90,
};

const COERCION_PER_TYPE = 8;
const COERCION_MAX = 16;
const LAYER_ADJUSTMENT = 10;
const TRUST_ADJUSTMENT = 10;
const SESSION_ADJUSTMENT_MAX = 15;
const SESSION_ADJUSTMENT_DIVISOR = 5;

export interface RiskThresholds {
  medium: number;
  high: number;
  critical: number;
}

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  medium: 30,
  high: 60,
  critical: 85,
};

const INSTRUCTION_LIKE_TYPES = new Set<Signal["attackType"]>([
  "instruction_override",
  "role_change",
  "tool_abuse",
  "credential_theft",
]);

function bandFor(score: number, thresholds: RiskThresholds): RiskBand {
  if (score >= thresholds.critical) return "CRITICAL";
  if (score >= thresholds.high) return "HIGH";
  if (score >= thresholds.medium) return "MEDIUM";
  return "LOW";
}

export interface ScoreInput {
  signals: Signal[];
  sourceTrust: TrustLevel;
  sessionRisk: number; // 0–100, from packages/agents session state
  thresholds?: RiskThresholds;
}

export function scoreRisk(input: ScoreInput): RiskAssessment {
  const { signals, sourceTrust, sessionRisk } = input;
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;

  if (signals.length === 0) {
    return { score: 0, band: "LOW", contributions: [], signals: [] };
  }

  const signalPoints = signals.map((s) => SEVERITY_BASE[s.severity] * s.confidence);
  const maxPoints = Math.max(...signalPoints);
  const topSignal = signals[signalPoints.indexOf(maxPoints)]!;

  const distinctAttackTypes = new Set(signals.map((s) => s.attackType)).size;
  const corroboration = Math.min(COERCION_MAX, (distinctAttackTypes - 1) * COERCION_PER_TYPE);

  const layerAdjustment = topSignal.evidence.some((span) => span.layer !== "visible") ? LAYER_ADJUSTMENT : 0;

  const hasInstructionSignal = signals.some((s) => INSTRUCTION_LIKE_TYPES.has(s.attackType));
  const trustAdjustment = sourceTrust === "untrusted" && hasInstructionSignal ? TRUST_ADJUSTMENT : 0;

  const sessionAdjustment = Math.min(SESSION_ADJUSTMENT_MAX, sessionRisk / SESSION_ADJUSTMENT_DIVISOR);

  const contributions: ScoreContribution[] = [
    { factor: `topSignal:${topSignal.detectorId}`, points: maxPoints },
    { factor: "corroboration", points: corroboration },
    { factor: "layerAdjustment", points: layerAdjustment },
    { factor: "trustAdjustment", points: trustAdjustment },
    { factor: "sessionAdjustment", points: sessionAdjustment },
  ];

  const rawScore = contributions.reduce((sum, c) => sum + c.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    score,
    band: bandFor(score, thresholds),
    contributions,
    signals,
  };
}
