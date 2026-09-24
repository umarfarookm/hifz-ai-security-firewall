import { z } from "zod";

/**
 * Every environment variable the app reads, validated once at startup.
 * See docs/architecture/LLD.md §8 and .env.example for what each one means.
 * The app must refuse to boot on invalid config rather than fail deep inside a request.
 */

const providerSchema = z.enum(["gemini", "anthropic", "openai", "deepseek", "ollama", "none"]);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "demo"]).default("local"),

    INVESTIGATOR_PROVIDER: providerSchema,
    INVESTIGATOR_MODEL: z.string().optional(),
    DEMO_AGENT_PROVIDER: providerSchema,
    DEMO_AGENT_MODEL: z.string().optional(),

    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(1),
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
    LLM_CACHE_ENABLED: z.coerce.boolean().default(true),

    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),
    OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434/v1"),

    RISK_THRESHOLD_MEDIUM: z.coerce.number().int().min(0).max(100).default(30),
    RISK_THRESHOLD_HIGH: z.coerce.number().int().min(0).max(100).default(60),
    RISK_THRESHOLD_CRITICAL: z.coerce.number().int().min(0).max(100).default(85),
    LLM_ESCALATION_BAND_MIN: z.coerce.number().int().min(0).max(100).default(20),
    LLM_ESCALATION_BAND_MAX: z.coerce.number().int().min(0).max(100).default(70),
    LLM_FAILURE_MODE: z.enum(["review", "block"]).default("review"),
    SESSION_RISK_DECAY_MINUTES: z.coerce.number().int().positive().default(30),

    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    RATE_LIMIT_PER_IP_PER_MIN: z.coerce.number().int().positive().default(10),
    DEMO_REPLAY_MODE: z.coerce.boolean().default(false),

    DEMO_FAKE_API_KEY: z.string().optional(),
    DEMO_FAKE_DB_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.RISK_THRESHOLD_MEDIUM >= env.RISK_THRESHOLD_HIGH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RISK_THRESHOLD_MEDIUM must be lower than RISK_THRESHOLD_HIGH",
        path: ["RISK_THRESHOLD_MEDIUM"],
      });
    }
    if (env.RISK_THRESHOLD_HIGH >= env.RISK_THRESHOLD_CRITICAL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RISK_THRESHOLD_HIGH must be lower than RISK_THRESHOLD_CRITICAL",
        path: ["RISK_THRESHOLD_HIGH"],
      });
    }
    if (env.APP_ENV === "demo") {
      if (env.INVESTIGATOR_PROVIDER === "ollama" || env.DEMO_AGENT_PROVIDER === "ollama") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ollama cannot be selected in the demo environment — a Vercel deployment cannot reach a local machine.",
          path: ["APP_ENV"],
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates process.env. Throws with a readable message on failure —
 * callers should let this crash the process at startup, not swallow it.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
