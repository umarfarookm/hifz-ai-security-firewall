export type {
  ModelGateway,
  ModelGatewayMetadata,
  ModelProvider,
  StructuredOutputRequest,
  StructuredOutputResult,
} from "./model-gateway.js";
export { InvalidStructuredOutputError } from "./model-gateway.js";

export { createModelGateway, ModelGatewayConfigError } from "./factory.js";
export type { ModelRole } from "./factory.js";
