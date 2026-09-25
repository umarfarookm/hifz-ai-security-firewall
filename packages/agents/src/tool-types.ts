/**
 * A minimal, recursive JSON-Schema-like shape used to describe tool
 * parameters in a way every provider's SDK can consume:
 *  - OpenAI-compatible (openai, deepseek, ollama): passed through almost as-is
 *    as `function.parameters`.
 *  - Anthropic: passed through almost as-is as `tool.input_schema`.
 *  - Gemini: structurally identical to its own `Schema` type — only the
 *    `type` field needs casting to Gemini's `SchemaType` enum.
 *
 * Kept deliberately small (no $ref, no oneOf/anyOf) — everything we need to
 * describe here (the four investigator tools, plus the verdict shape) fits
 * in this subset.
 */
export interface JSONSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface ToolParameters extends JSONSchemaProperty {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
}

/** One tool invocation the model asked for, in a provider-neutral shape. */
export interface RequestedToolCall {
  id: string;
  name: string;
  /** Raw JSON string of arguments, as the model produced it — validate before use. */
  argsJson: string;
}

export type ToolTurnResult =
  | { kind: "tool_calls"; calls: RequestedToolCall[] }
  | { kind: "no_tool_call"; text: string };

/** One prior turn in the tool-calling conversation, fed back to the model. */
export type ToolConversationMessage =
  | { role: "assistant"; toolCalls: RequestedToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; resultJson: string };
