import type {
  ModelGateway,
  ModelGatewayMetadata,
  StructuredOutputRequest,
  StructuredOutputResult,
  ToolTurnRequest,
} from "../model-gateway.js";
import type { ToolTurnResult } from "../tool-types.js";

/**
 * The `none` provider means "rules-only mode" — the escalation router
 * (docs/architecture/LLD.md §3.5) is expected to skip calling the gateway
 * entirely when a role is configured this way, recording
 * `llmStatus = not_called`. This class exists so a caller that forgets that
 * check fails loudly instead of silently doing nothing.
 */
export class NoneGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata = { provider: "none", model: "none" };

  async generateStructured<T>(_request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    throw new Error(
      "generateStructured() was called on the 'none' provider. The escalation router must skip the LLM call " +
        "entirely for this role, not invoke the gateway — see docs/architecture/LLD.md §3.5.",
    );
  }

  async runToolTurn(_request: ToolTurnRequest): Promise<ToolTurnResult> {
    throw new Error(
      "runToolTurn() was called on the 'none' provider. The escalation router must skip the LLM call " +
        "entirely for this role, not invoke the gateway — see docs/architecture/LLD.md §3.5.",
    );
  }
}
