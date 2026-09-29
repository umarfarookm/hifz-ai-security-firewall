import {
  ingestAdapters,
  normalize,
  recursivelyDecode,
  runDetectors,
  runPolicy,
  scoreRisk,
  type ContentType,
  type PolicyAction,
  type RiskBand,
  type TrustLevel,
} from "@hifz/firewall-core";
import { runEscalation, type InvestigatorTools, type ModelGateway, type SessionHistoryEntry, type SourceProfile } from "@hifz/agents";
import type { EvalCase } from "./types.js";

export type EvalMode = "rules_only" | "rules_llm";

// Trust defaults per docs/architecture/LLD.md §2.1 — same rule apps/web/lib/inspect.ts applies.
export function trustFor(source: EvalCase["source"]): TrustLevel {
  return source === "user_message" ? "semi_trusted" : "untrusted";
}

/**
 * Each eval case is scored independently — no session history, matching
 * measure-latency.ts's "session risk is 0 here since each case is measured
 * independently, not as part of a session." getSessionHistory/
 * getSourceProfile have nothing case-independent to return, so they're
 * stubbed rather than backed by a real audit store.
 */
function buildInvestigatorTools(): InvestigatorTools {
  return {
    decode: (text: string) => {
      const { layers } = recursivelyDecode(text, "visible", { bytesUsed: 0 });
      const first = layers[0];
      return first ? { encoding: first.encoding, decoded: first.text } : { encoding: null, decoded: null };
    },
    rescan: (text: string) => {
      const signals = runDetectors({ visibleText: text, hiddenSegments: [], decodedLayers: [], transforms: [], anomalies: [] });
      return { signals };
    },
    getSessionHistory: async () => [] as SessionHistoryEntry[],
    getSourceProfile: async (): Promise<SourceProfile> => ({ trust: "untrusted", priorIncidentCount: 0 }),
  };
}

export interface RunCaseDeps {
  mode: EvalMode;
  /** Required when mode is "rules_llm"; ignored (must be null) for "rules_only". */
  gateway: ModelGateway | null;
  escalationBand: { min: number; max: number };
  failureMode: "review" | "block";
  detectorVersion: string;
  investigatorTimeoutMs: number;
  investigatorTemperature: number;
  investigatorMaxRetries: number;
}

export interface CaseOutcome {
  action: PolicyAction;
  band: RiskBand;
  latencyMs: number;
}

/**
 * Runs one eval case through the real pipeline (ingest -> normalize ->
 * detect -> score -> [escalate] -> policy), reusing the exact same
 * firewall-core/agents functions apps/web/lib/inspect.ts calls — eval
 * can't import apps/web (see eslint.config.js), so this is a from-scratch
 * wiring rather than a shared helper, same pattern as measure-latency.ts.
 */
export async function runCase(evalCase: EvalCase, deps: RunCaseDeps): Promise<CaseOutcome> {
  const start = process.hrtime.bigint();

  const adapter = ingestAdapters[evalCase.contentType as ContentType];
  if (!adapter) {
    throw new Error(`no ingest adapter for contentType "${evalCase.contentType}" (case ${evalCase.caseId})`);
  }

  const trust = trustFor(evalCase.source);
  const ingested = await adapter(evalCase.content);
  const normalized = normalize(ingested);
  const signals = runDetectors(normalized);
  const riskAssessment = scoreRisk({ signals, sourceTrust: trust, sessionRisk: 0 });

  // mode="rules_only" simulates INVESTIGATOR_PROVIDER=none for every case,
  // regardless of its own score — same semantics apps/web/lib/inspect.ts
  // gets for real when the env is configured that way (§3.5's last row).
  const gateway = deps.mode === "rules_only" ? null : deps.gateway;

  const escalation = await runEscalation({
    riskAssessment,
    escalationBand: deps.escalationBand,
    gateway,
    failureMode: deps.failureMode,
    investigatorRequest: {
      content: normalized.visibleText,
      tools: buildInvestigatorTools(),
      detectorVersion: deps.detectorVersion,
      timeoutMs: deps.investigatorTimeoutMs,
      temperature: deps.investigatorTemperature,
      maxRetries: deps.investigatorMaxRetries,
    },
  });

  const policy = runPolicy({
    finalBand: escalation.finalBand,
    sourceTrust: trust,
    failSafeAction: escalation.failSafeAction,
    normalized,
    signals,
  });

  const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;

  return { action: policy.action, band: escalation.finalBand, latencyMs };
}
