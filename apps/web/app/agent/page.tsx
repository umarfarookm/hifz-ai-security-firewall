"use client";

import { useEffect, useState } from "react";
import type { ToolCallLogEntry } from "@hifz/agents";
import type { AgentRunResponseBody } from "../../lib/agent-run.js";
import { GuardBadge } from "../../components/badges.js";

interface InboxEmail {
  id: string;
  from: string;
  subject: string;
  preview: string;
}

interface ApiError {
  error: string;
  issues?: string[];
  message?: string;
}

const DEFAULT_INSTRUCTION = "Check the inbox and summarize anything that needs my attention.";
const EXAMPLE_INSTRUCTIONS = [DEFAULT_INSTRUCTION, "Read the inbox and reply to anything urgent."];

export default function AgentDemoPage() {
  const [inbox, setInbox] = useState<InboxEmail[] | null>(null);
  const [instruction, setInstruction] = useState<string>(DEFAULT_INSTRUCTION);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentRunResponseBody | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    fetch("/api/v1/agent/inbox")
      .then((res) => res.json() as Promise<{ emails: InboxEmail[] }>)
      .then((json) => setInbox(json.emails))
      .catch(() => setInbox([]));
  }, []);

  async function runAgent() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json as ApiError);
        return;
      }
      setResult(json as AgentRunResponseBody);
    } catch (err) {
      setError({ error: "network error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rise-in">
      <h1 className="text-xl font-medium tracking-tight text-ink">Agent demo</h1>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-dim">
        HIFZ Mail — a protected email assistant. Every tool call it proposes is checked by the Action Guard (G1–G6) before it runs.
      </p>

      <div className="mt-9 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_INSTRUCTIONS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInstruction(ex)}
                className="rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-dim transition-colors duration-150 hover:border-line-strong hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>

          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            className="mt-4 w-full rounded-md border border-line bg-surface p-4 text-[13px] leading-relaxed text-ink outline-none transition-colors duration-150 focus:border-accent/50"
            placeholder="Tell HIFZ Mail what to do…"
          />

          <button
            type="button"
            onClick={runAgent}
            disabled={loading || instruction.trim().length === 0}
            className="mt-4 rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-canvas transition-opacity duration-150 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {loading ? "Running…" : "Run agent"}
          </button>

          {error && (
            <div className="mt-6 rounded-lg border border-[color:var(--band-critical)]/25 bg-[color:var(--band-critical)]/5 p-4 text-[13px] text-[color:var(--band-critical)]">
              <div className="font-medium">{error.error}</div>
              {error.issues && (
                <ul className="mt-2 list-disc space-y-1 pl-5 opacity-90">
                  {error.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
              {error.message && <p className="mt-2 opacity-90">{error.message}</p>}
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4 rise-in">
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Pipeline trace</div>
                {result.toolCalls.length === 0 ? (
                  <p className="text-[13px] text-ink-faint">The agent replied directly, with no tool calls.</p>
                ) : (
                  <ol className="space-y-2">
                    {result.toolCalls.map((call, i) => (
                      <ToolCallStep key={i} call={call} />
                    ))}
                  </ol>
                )}
              </div>

              {result.finalMessage && (
                <div className="rounded-lg border border-line bg-surface p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">HIFZ Mail says</div>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink">{result.finalMessage}</p>
                </div>
              )}

              <div className="font-mono text-[11px] text-ink-faint">llmStatus: {result.llmStatus}</div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Inbox</div>
          <div className="space-y-2">
            {(inbox ?? []).map((email) => (
              <div key={email.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="truncate text-[11px] text-ink-faint">{email.from}</div>
                <div className="mt-0.5 truncate text-[13px] font-medium text-ink">{email.subject}</div>
                <div className="mt-1 line-clamp-2 text-[12px] text-ink-faint">{email.preview}</div>
              </div>
            ))}
            {inbox === null && <p className="text-[13px] text-ink-faint">Loading…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolCallStep({ call }: { call: ToolCallLogEntry }) {
  const blocked = call.guardOutcome === "BLOCK";
  return (
    <li
      className={`rounded-lg border p-3 ${
        blocked ? "border-[color:var(--band-critical)]/25 bg-[color:var(--band-critical)]/5" : "border-line bg-surface"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[13px] text-ink">{call.tool}</span>
        <GuardBadge outcome={call.guardOutcome} />
      </div>
      <p className="mt-1 text-[12px] text-ink-faint">{call.guardReason}</p>
      {Object.keys(call.args).length > 0 && (
        <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[11px] text-ink-dim">{JSON.stringify(call.args, null, 2)}</pre>
      )}
    </li>
  );
}
