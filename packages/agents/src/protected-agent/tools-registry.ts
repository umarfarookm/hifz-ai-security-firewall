import { z } from "zod";

export type ToolRiskClass = "low" | "high" | "critical";

export interface ToolRegistryEntry {
  name: string;
  riskClass: ToolRiskClass;
  parametersSchema: z.ZodType<Record<string, unknown>>;
  /** Which argument field (if any) the G3 destination check applies to. */
  destinationField?: string;
  /** Glob patterns ("*" wildcard), e.g. "*@hifz-demo.test". */
  destinationAllowlist?: string[];
}

/**
 * Mirrors policies/tools.yaml. [DECISION] Hardcoded here rather than
 * loaded from the YAML file — policy loading from disk is @hifz/config's
 * job (see the repository layout in the README) and doesn't exist yet. Keep
 * this in sync with policies/tools.yaml by hand until it does.
 */
export const TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  read_inbox: {
    name: "read_inbox",
    riskClass: "low",
    parametersSchema: z.object({}),
  },
  summarize: {
    name: "summarize",
    riskClass: "low",
    parametersSchema: z.object({ text: z.string() }),
  },
  send_email: {
    name: "send_email",
    riskClass: "high",
    parametersSchema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
    destinationField: "to",
    destinationAllowlist: ["*@hifz-demo.test"],
  },
  read_secrets: {
    name: "read_secrets",
    riskClass: "critical",
    parametersSchema: z.object({ name: z.string() }),
  },
};
