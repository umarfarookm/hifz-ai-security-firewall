import type { z } from "zod";
import { InvalidStructuredOutputError } from "../model-gateway.js";

/**
 * Parses and validates a model's raw text response. Every provider
 * implementation funnels through this so "malformed output → REVIEW"
 * (docs/architecture/LLD.md §3.6) is enforced in exactly one place.
 */
export function parseStructuredOutput<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidStructuredOutputError("Model response was not valid JSON", raw);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidStructuredOutputError(`Model response failed schema validation: ${result.error.message}`, raw);
  }
  return result.data;
}
