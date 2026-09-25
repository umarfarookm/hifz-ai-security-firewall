import type { AttackType, RiskBand, Signal, TrustLevel } from "@hifz/firewall-core";
import type { ToolDefinition } from "../tool-types.js";

export interface DecodeResult {
  encoding: "base64" | "hex" | "url" | "html_entity" | null;
  decoded: string | null;
}

export interface RescanResult {
  signals: Signal[];
}

export interface SessionHistoryEntry {
  band: RiskBand;
  attackTypes: AttackType[];
}

export interface SourceProfile {
  trust: TrustLevel;
  priorIncidentCount: number;
}

/**
 * Read-only, pure, no-network tools the investigator may call
 * (docs/architecture/LLD.md §3.6). Implementations are injected rather than
 * imported directly — this package doesn't depend on the real normalizer,
 * detectors, or Supabase, so it can be built and tested against synthetic
 * fixtures independently of those (see docs/PLAN.md 1.7/1.8/2.1). The real
 * implementations get wired in at the API route layer (task 2.9).
 */
export interface InvestigatorTools {
  decode(text: string): DecodeResult | Promise<DecodeResult>;
  rescan(text: string): RescanResult | Promise<RescanResult>;
  getSessionHistory(sessionId: string): SessionHistoryEntry[] | Promise<SessionHistoryEntry[]>;
  getSourceProfile(origin: string): SourceProfile | Promise<SourceProfile>;
}

export const INVESTIGATOR_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "decode",
    description:
      "Attempt to decode a suspicious span of text the normalizer may have missed (Base64, hex, URL, or HTML-entity encoding). Returns the decoded text if one of those encodings is detected, or nulls if it isn't encoded.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "The suspicious text span to try decoding." } },
      required: ["text"],
    },
  },
  {
    name: "rescan",
    description:
      "Re-run the deterministic content detectors on a piece of text (e.g. a decoded layer) to check whether it contains attack patterns.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "The text to re-scan." } },
      required: ["text"],
    },
  },
  {
    name: "getSessionHistory",
    description: "Get the last 10 decisions for this session — risk band and attack types only, never raw content.",
    parameters: {
      type: "object",
      properties: { sessionId: { type: "string", description: "The session identifier." } },
      required: ["sessionId"],
    },
  },
  {
    name: "getSourceProfile",
    description: "Get the trust level and prior incident count for a content origin (a URL, sender address, or API name).",
    parameters: {
      type: "object",
      properties: { origin: { type: "string", description: "The content's origin identifier." } },
      required: ["origin"],
    },
  },
];
