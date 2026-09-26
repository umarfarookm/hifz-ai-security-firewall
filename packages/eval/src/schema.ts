import { z } from "zod";

/**
 * Runtime-validated shape of one line in datasets/**\/*.jsonl.
 * Mirrors the EvalCase type in types.ts — kept as a separate zod schema
 * (rather than deriving the type from it) because EvalCase re-exports enum
 * types owned by @hifz/firewall-core, and this schema needs its own literal
 * list for zod's `enum()` regardless.
 */
export const evalCaseSchema = z.object({
  caseId: z.string().min(1),
  category: z.enum([
    "instruction_override",
    "role_change",
    "secret_extraction",
    "tool_abuse",
    "credential_theft",
    "context_poisoning",
    "multi_step_jailbreak",
    "encoded_instructions",
    "indirect_prompt_injection",
    "legitimate",
  ]),
  contentType: z.enum(["text", "markdown", "html", "email", "json", "source_code", "pdf", "docx"]),
  source: z.enum(["user_message", "web_page", "email", "api_response", "document", "tool_output"]),
  content: z.string().min(1),
  expectedAction: z.enum(["ALLOW", "SANITIZE", "REVIEW", "BLOCK"]),
  expectedMinBand: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  origin: z.enum(["own", "bipia", "deepset", "notinject"]),
  notes: z.string().optional(),
});

export type ValidatedEvalCase = z.infer<typeof evalCaseSchema>;
