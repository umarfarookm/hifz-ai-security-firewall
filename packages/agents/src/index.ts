export type {
  ModelGateway,
  ModelGatewayMetadata,
  ModelProvider,
  StructuredOutputRequest,
  StructuredOutputResult,
  ToolTurnRequest,
} from "./model-gateway.js";
export { InvalidStructuredOutputError } from "./model-gateway.js";

export type {
  JSONSchemaProperty,
  ToolParameters,
  ToolDefinition,
  RequestedToolCall,
  ToolTurnResult,
  ToolConversationMessage,
} from "./tool-types.js";

export { createModelGateway, ModelGatewayConfigError } from "./factory.js";
export type { ModelRole } from "./factory.js";

export * from "./investigator/index.js";
export * from "./escalation/index.js";
export * from "./protected-agent/index.js";
