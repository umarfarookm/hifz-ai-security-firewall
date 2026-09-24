import { z } from "zod";
import { describe, expect, it } from "vitest";
import { InvalidStructuredOutputError } from "../model-gateway.js";
import { parseStructuredOutput } from "./parse-structured-output.js";

const verdictSchema = z.object({
  isInjection: z.boolean(),
  band: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

describe("parseStructuredOutput", () => {
  it("parses and validates well-formed JSON matching the schema", () => {
    const result = parseStructuredOutput('{"isInjection": true, "band": "HIGH"}', verdictSchema);
    expect(result).toEqual({ isInjection: true, band: "HIGH" });
  });

  it("throws InvalidStructuredOutputError on invalid JSON", () => {
    expect(() => parseStructuredOutput("not json", verdictSchema)).toThrow(InvalidStructuredOutputError);
  });

  it("throws InvalidStructuredOutputError when the JSON doesn't match the schema", () => {
    expect(() => parseStructuredOutput('{"isInjection": "yes"}', verdictSchema)).toThrow(InvalidStructuredOutputError);
  });

  it("throws InvalidStructuredOutputError on a band value outside the enum", () => {
    expect(() => parseStructuredOutput('{"isInjection": true, "band": "SEVERE"}', verdictSchema)).toThrow(
      InvalidStructuredOutputError,
    );
  });

  it("keeps the raw text on the thrown error for audit logging", () => {
    try {
      parseStructuredOutput("garbage", verdictSchema);
      throw new Error("expected parseStructuredOutput to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidStructuredOutputError);
      expect((err as InstanceType<typeof InvalidStructuredOutputError>).raw).toBe("garbage");
    }
  });
});
