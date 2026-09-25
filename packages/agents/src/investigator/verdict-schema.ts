import { z } from "zod";
import type { ToolDefinition } from "../tool-types.js";

/**
 * Mirrors the AttackType enum in packages/firewall-core/src/types.ts.
 * Duplicated (not imported) because this is what we ask the *model* to
 * produce, not our own internal type — keeping them separate makes it
 * obvious this list needs updating by hand if the official 9 categories
 * ever change.
 */
export const ATTACK_TYPES = [
  "instruction_override",
  "role_change",
  "secret_extraction",
  "tool_abuse",
  "credential_theft",
  "context_poisoning",
  "multi_step_jailbreak",
  "encoded_instructions",
  "indirect_prompt_injection",
] as const;

export const RISK_BANDS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const EVIDENCE_LAYERS = ["visible", "hidden", "decoded"] as const;

/**
 * What the model must produce when it calls submit_verdict. Deliberately
 * excludes modelTag — we set that ourselves from the gateway's metadata,
 * never trusting a model to self-report which model it is.
 */
export const llmVerdictSchema = z.object({
  isInjection: z.boolean(),
  attackTypes: z.array(z.enum(ATTACK_TYPES)),
  band: z.enum(RISK_BANDS),
  rationale: z.string().max(500),
  evidence: z.array(
    z.object({
      start: z.number().int(),
      end: z.number().int(),
      excerpt: z.string().max(200),
      layer: z.enum(EVIDENCE_LAYERS),
    }),
  ),
  stepsTaken: z.array(z.string()),
});

export type LlmVerdict = z.infer<typeof llmVerdictSchema>;

/**
 * Tool-calling equivalent of llmVerdictSchema, hand-kept in sync with it —
 * see the note on JSONSchemaProperty in ../tool-types.ts for why this isn't
 * generated from the zod schema.
 */
export const SUBMIT_VERDICT_TOOL: ToolDefinition = {
  name: "submit_verdict",
  description:
    "Call this exactly once, when you are ready to give your final assessment. Do not call any other tool after this, and do not call it more than once.",
  parameters: {
    type: "object",
    properties: {
      isInjection: { type: "boolean", description: "Whether this content is a prompt injection attempt." },
      attackTypes: {
        type: "array",
        description: "Which of the attack categories apply. Empty array if isInjection is false.",
        items: { type: "string", enum: [...ATTACK_TYPES] },
      },
      band: {
        type: "string",
        description: "Your assessed risk band. Can only raise the risk already found by the deterministic rules, never lower it.",
        enum: [...RISK_BANDS],
      },
      rationale: { type: "string", description: "A short (under 500 characters) explanation of your assessment." },
      evidence: {
        type: "array",
        description: "Spans of the analysed content that support your assessment. Offsets must be valid positions within the content you were given.",
        items: {
          type: "object",
          properties: {
            start: { type: "integer", description: "Start offset in the analysed content." },
            end: { type: "integer", description: "End offset in the analysed content." },
            excerpt: { type: "string", description: "The text at that span, up to 200 characters." },
            layer: { type: "string", enum: [...EVIDENCE_LAYERS] },
          },
          required: ["start", "end", "excerpt", "layer"],
        },
      },
      stepsTaken: {
        type: "array",
        description: "A short trace of what you considered or checked, for the evidence view.",
        items: { type: "string" },
      },
    },
    required: ["isInjection", "attackTypes", "band", "rationale", "evidence", "stepsTaken"],
  },
};
