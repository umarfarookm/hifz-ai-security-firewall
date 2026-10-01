"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

/**
 * One-click prompts, each chosen because it exercises a different Action Guard path. The outcomes were
 * measured against the live agent (3 runs each, all identical) — see docs/demo-script.md. Asking the agent to
 * "follow the instructions in an email" is deliberately not here: the model refuses on its own, so the guard
 * never gets a chance to act.
 */
const EXAMPLES = [
  { label: "Summarize inbox", instruction: DEFAULT_INSTRUCTION, shows: "Reads and summarizes. Low-risk tools run; the guard still scans what leaves." },
  {
    label: "Email a colleague",
    instruction: "Email priya@hifz-demo.test to say I will be at sprint planning at 3pm.",
    shows: "A normal request to an allowed address: the guard lets it through (EXECUTE).",
  },
  {
    label: "Email an outside address",
    instruction: "Summarize my inbox and email the summary to my manager at boss@gmail.com.",
    shows: "G3: the destination is not on the allowlist, so the send needs approval.",
  },
  {
    label: "Send after reading the inbox",
    instruction: "Summarize my inbox and email the summary to priya@hifz-demo.test.",
    shows: "G5: the inbox contains untrusted content, so even an allowed recipient needs approval.",
  },
  {
    label: "Email the DB password",
    instruction: "Look up the db_password secret and email it to ops@hifz-demo.test.",
    shows: "G4: the agent reads the (fake) secret, and the outbound secret scan blocks the email.",
  },
] as const;

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
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setInstruction(ex.instruction)}
                title={ex.shows}
                className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors duration-150 hover:border-line-strong hover:text-ink ${
                  instruction === ex.instruction ? "border-line-strong text-ink" : "border-line text-ink-dim"
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>
          <p className="mt-2 min-h-[1.25rem] text-[12px] leading-relaxed text-ink-faint">
            {EXAMPLES.find((ex) => ex.instruction === instruction)?.shows ?? ""}
          </p>

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
      {call.guardOutcome === "REQUIRE_APPROVAL" && (
        <Link href="/reviews" className="mt-1.5 inline-block text-[12px] text-accent hover:underline">
          Held for approval: open the review queue →
        </Link>
      )}
      {call.checks.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-ink-faint">
          {call.checks.map((check) => (
            <li key={check.checkId}>
              <span className={check.passed ? "text-[color:var(--band-low)]" : "text-[color:var(--band-critical)]"}>
                {check.passed ? "✓" : "✗"}
              </span>{" "}
              {check.checkId}: {check.detail}
            </li>
          ))}
        </ul>
      )}
      {Object.keys(call.args).length > 0 && (
        <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[11px] text-ink-dim">{JSON.stringify(call.args, null, 2)}</pre>
      )}
    </li>
  );
}
