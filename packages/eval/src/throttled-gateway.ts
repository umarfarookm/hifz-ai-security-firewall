import type {
  ModelGateway,
  ModelGatewayMetadata,
  StructuredOutputRequest,
  StructuredOutputResult,
  ToolTurnRequest,
  ToolTurnResult,
} from "@hifz/agents";

/**
 * Eval-only decorator: spaces every model request at least `minIntervalMs` apart and records why any
 * request failed. A free-tier key caps requests per minute (Gemini Flash-Lite: 15 RPM), and one
 * investigator case makes several requests, so pacing per case is not enough — it has to be per request.
 * Without this a burst gets rejected, the investigator fails safe to REVIEW, and the run is not a clean
 * rules+LLM measurement. The investigator swallows the underlying error, so it is captured here.
 */
export class ThrottledGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata;
  /** Failure message → count, for the run report. */
  readonly failures = new Map<string, number>();
  private nextSlotAt = 0;

  constructor(
    private readonly inner: ModelGateway,
    private readonly minIntervalMs: number,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
  ) {
    this.metadata = inner.metadata;
  }

  private async waitForSlot(): Promise<void> {
    const start = Math.max(this.now(), this.nextSlotAt);
    this.nextSlotAt = start + this.minIntervalMs;
    const delay = start - this.now();
    if (delay > 0) await this.sleep(delay);
  }

  private record(err: unknown): void {
    const message = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 160);
    this.failures.set(message, (this.failures.get(message) ?? 0) + 1);
  }

  async generateStructured<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    await this.waitForSlot();
    try {
      return await this.inner.generateStructured(request);
    } catch (err) {
      this.record(err);
      throw err;
    }
  }

  async runToolTurn(request: ToolTurnRequest): Promise<ToolTurnResult> {
    await this.waitForSlot();
    try {
      return await this.inner.runToolTurn(request);
    } catch (err) {
      this.record(err);
      throw err;
    }
  }
}
