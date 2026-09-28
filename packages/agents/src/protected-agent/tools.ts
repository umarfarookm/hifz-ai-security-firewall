import type { ToolDefinition } from "../tool-types.js";

/**
 * LLM-facing tool definitions for the protected demo agent
 * (docs/architecture/LLD.md §3.8). Kept in sync by hand with
 * tools-registry.ts's parameter schemas — that file validates what the
 * model actually sends (G2); this file only describes the shape to the
 * model in the first place.
 */
export const PROTECTED_AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "read_inbox",
    description: "Read the user's inbox. Returns a list of emails, each with an id, sender, subject, and body.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "summarize",
    description: "Summarize a piece of text (e.g. an email body) into a short summary.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "The text to summarize." } },
      required: ["text"],
    },
  },
  {
    name: "send_email",
    description: "Send an email reply. Only use this when the user has actually asked you to reply to something.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string", description: "Email subject." },
        body: { type: "string", description: "Email body." },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "read_secrets",
    description: "Look up a stored secret by name. Only use this when the user directly and explicitly asks for a specific secret.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "The name of the secret to look up." } },
      required: ["name"],
    },
  },
];

/**
 * Not a real action — the mechanism the agent uses to end its turn with a
 * message for the user, mirroring the investigator's submit_verdict
 * pattern (../investigator/verdict-schema.ts). [DECISION] Every provider's
 * runToolTurn() forces a tool call every turn (tool_choice "required"/
 * "any"/ANY), so the agent needs an explicit way to say "I'm done" rather
 * than replying in plain text.
 */
export const FINAL_RESPONSE_TOOL: ToolDefinition = {
  name: "final_response",
  description: "Call this exactly once, when you're ready to give your final reply to the user.",
  parameters: {
    type: "object",
    properties: { message: { type: "string", description: "Your reply to the user." } },
    required: ["message"],
  },
};
