/**
 * Core domain model for the firewall pipeline.
 * Mirrors docs/architecture/LLD.md §2 — keep the two in sync when either changes.
 */

export type ContentType =
  | "text"
  | "markdown"
  | "html"
  | "email"
  | "json"
  | "source_code"
  | "pdf"
  | "docx"
  | "image";

export type ProvenanceSource =
  | "user_message"
  | "web_page"
  | "email"
  | "api_response"
  | "document"
  | "tool_output";

export type TrustLevel = "trusted" | "semi_trusted" | "untrusted";

export type IntendedUse = "chat_input" | "agent_context" | "tool_result";

export interface ContentEnvelope {
  id: string;
  correlationId: string;
  sessionId: string;
  contentType: ContentType;
  raw: string;
  provenance: {
    source: ProvenanceSource;
    trust: TrustLevel;
    origin: string;
  };
  intendedUse: IntendedUse;
}

export interface Span {
  start: number;
  end: number;
  excerpt: string;
  layer: "visible" | "hidden" | "decoded";
}

export interface DecodedLayer {
  encoding: "base64" | "hex" | "url" | "html_entity";
  depth: number;
  text: string;
  sourceSpan: Span;
}

export interface NormalizedContent {
  visibleText: string;
  hiddenSegments: Span[];
  decodedLayers: DecodedLayer[];
  transforms: string[];
  anomalies: string[];
}

export type AttackType =
  | "instruction_override"
  | "role_change"
  | "secret_extraction"
  | "tool_abuse"
  | "credential_theft"
  | "context_poisoning"
  | "multi_step_jailbreak"
  | "encoded_instructions"
  | "indirect_prompt_injection";

export type Severity = "low" | "medium" | "high" | "critical";

export interface Signal {
  detectorId: string;
  attackType: AttackType;
  severity: Severity;
  confidence: number; // 0–1
  evidence: Span[];
}

export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ScoreContribution {
  factor: string;
  points: number;
}

export interface RiskAssessment {
  score: number; // 0–100
  band: RiskBand;
  contributions: ScoreContribution[];
  signals: Signal[];
}

export type PolicyAction = "ALLOW" | "SANITIZE" | "REVIEW" | "BLOCK";

export type LlmStatus = "not_called" | "ok" | "unavailable" | "invalid_output" | "cached";

export interface Decision {
  action: PolicyAction;
  policyRuleId: string;
  reason: string;
  sanitizedContent: string | null;
  finalBand: RiskBand;
  llmStatus: LlmStatus;
}

export interface InvestigatorVerdict {
  isInjection: boolean;
  attackTypes: AttackType[];
  band: RiskBand;
  rationale: string; // ≤ 500 chars, shown in the evidence view
  evidence: Span[]; // Offsets must exist in the input the investigator was given
  stepsTaken: string[]; // Plan trace for the UI
  modelTag: string; // "provider:model"
}

export type GuardOutcome = "EXECUTE" | "BLOCK" | "REQUIRE_APPROVAL";

export interface ToolCallRequest {
  tool: string;
  args: Record<string, unknown>;
  sessionId: string;
  /** Ids of the ContentEnvelope(s) that led to this proposed call — used by the taint check (G5). */
  triggeringContentIds: string[];
}

export interface GuardCheckResult {
  checkId: string;
  passed: boolean;
  detail: string;
}

export interface GuardDecision {
  outcome: GuardOutcome;
  checks: GuardCheckResult[];
  reason: string;
  reviewId: string | null;
}
