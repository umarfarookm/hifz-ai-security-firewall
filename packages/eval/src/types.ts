import type { AttackType, ContentType, ProvenanceSource, RiskBand } from "@hifz/firewall-core";

/**
 * One line of datasets/**\/*.jsonl. See docs/architecture/LLD.md §7.
 */
export interface EvalCase {
  caseId: string;
  category: AttackType | "legitimate";
  contentType: ContentType;
  source: ProvenanceSource;
  content: string;
  expectedAction: "ALLOW" | "SANITIZE" | "REVIEW" | "BLOCK";
  expectedMinBand: RiskBand;
  origin: "own" | "bipia" | "deepset" | "notinject";
  notes?: string;
}
