"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ToolCallLogEntry } from "@hifz/agents";
import type { AgentRunResponseBody } from "../../lib/agent-run.js";
import { GuardBadge } from "../../components/badges.js";
import { CHECK_PLAIN, TOOL_PLAIN } from "../../components/plain-labels.js";

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

const OUTCOME: Record<string, { label: string; tone: string; icon: React.ReactNode }> = {
  EXECUTE: {
    label: "Went ahead",
    tone: "border-line bg-surface text-[color:var(--band-low)]",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12l3 3 5-6" />
      </>
    ),
  },
  REQUIRE_APPROVAL: {
    label: "Held for a person to approve",
    tone: "border-[color:var(--band-medium)]/35 bg-[color:var(--band-medium)]/8 text-[color:var(--band-medium)]",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M10 8v8M14 8v8" />
      </>
    ),
  },
  BLOCK: {
    label: "Stopped by the guard",
    tone: "border-[color:var(--band-critical)]/35 bg-[color:var(--band-critical)]/8 text-[color:var(--band-critical)]",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 8l8 8M16 8l-8 8" />
      </>
    ),
  },
};

const chip =
  "inline-flex min-h-11 items-center rounded-xl border-2 px-4 text-[15px] font-semibold transition-colors hover:border-accent hover:bg-accent-tint";

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

  const selected = EXAMPLES.find((ex) => ex.instruction === instruction);
  return (
    <div className="rise-in">
      <h1 className="text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-4xl">Agent demo</h1>
      <p className="mt-2 max-w-3xl text-lg leading-relaxed text-ink-dim">
        Meet HIFZ Mail, an email assistant that can read your inbox, write summaries and send emails. Every action it tries is checked by a guard before it runs.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="rounded-[28px] border border-line bg-surface p-5 shadow-[0_12px_40px_rgba(31,26,23,0.07)] sm:p-6">
            <label htmlFor="agent-instruction" className="block text-base font-bold text-ink">
              What should HIFZ Mail do?
            </label>
            <textarea
              id="agent-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-2xl border-2 border-line-strong bg-surface p-4 text-[18px] leading-relaxed text-ink transition-colors focus:border-accent"
              placeholder="Tell HIFZ Mail what to do…"
            />
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={runAgent}
                disabled={loading || instruction.trim().length === 0}
                className="inline-flex h-12 items-center rounded-2xl bg-accent px-7 text-xl font-bold text-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Running…" : "Run agent"}
              </button>
              <span className="text-base text-ink-dim">Everything here is simulated. No real email is sent.</span>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-lg font-bold text-ink">Not sure what to ask? Try one of these.</div>
            <div className="mt-4 flex flex-wrap gap-3">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setInstruction(ex.instruction)}
                  title={ex.shows}
                  className={`${chip} ${instruction === ex.instruction ? "border-accent bg-accent-tint text-ink" : "border-line bg-surface text-ink"}`}
                >
                  {ex.label}
                </button>
              ))}
            </div>
            {selected && (
              <p className="mt-4 rounded-2xl border border-line bg-canvas px-4 py-4 text-base leading-relaxed text-ink-dim">
                <b className="text-ink">What this shows: </b>
                {selected.shows}
              </p>
            )}
          </div>

          {error && (
            <div role="alert" className="mt-5 rounded-2xl border-2 border-[color:var(--band-critical)]/35 bg-[color:var(--band-critical)]/8 p-5 text-base text-ink">
              <div className="text-lg font-bold text-[color:var(--band-critical)]">{error.error}</div>
              {error.issues && (
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  {error.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
              {error.message && <p className="mt-2">{error.message}</p>}
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-5 rise-in">
              <section aria-label="What happened">
                <h2 className="text-2xl font-extrabold tracking-tight text-ink">What happened</h2>
                {result.toolCalls.length === 0 ? (
                  <p className="mt-4 text-lg text-ink-dim">The assistant replied directly, with no tool calls.</p>
                ) : (
                  <ol className="mt-3 space-y-4">
                    {result.toolCalls.map((call, i) => (
                      <ToolCallStep key={i} call={call} />
                    ))}
                  </ol>
                )}
              </section>

              {result.finalMessage && (
                <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
                  <h2 className="text-xl font-extrabold tracking-tight text-ink">HIFZ Mail says</h2>
                  <p className="mt-3 text-lg leading-relaxed text-ink">{result.finalMessage}</p>
                </section>
              )}

              <div className="font-mono text-[14px] text-ink-dim">llmStatus: {result.llmStatus}</div>
            </div>
          )}
        </div>

        <aside aria-label="Your inbox">
          <h2 className="text-xl font-extrabold tracking-tight text-ink">Your inbox</h2>
          <p className="mt-1 text-base text-ink-dim">The emails HIFZ Mail can read.</p>
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {(inbox ?? []).map((email) => (
              <div key={email.id} className="px-4 py-4">
                <div className="truncate text-[14px] text-ink-dim">{email.from}</div>
                <div className="mt-0.5 text-base font-bold leading-snug text-ink">{email.subject}</div>
                <div className="mt-1 line-clamp-2 text-[15px] leading-snug text-ink-dim">{email.preview}</div>
              </div>
            ))}
            {inbox === null && <p className="px-4 py-4 text-base text-ink-dim">Loading…</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ToolCallStep({ call }: { call: ToolCallLogEntry }) {
  const outcome = OUTCOME[call.guardOutcome] ?? OUTCOME.EXECUTE!;
  const to = typeof call.args.to === "string" ? call.args.to : null;
  return (
    <li className={`rounded-3xl border-2 p-4 sm:p-5 ${outcome.tone}`}>
      <div className="flex items-start gap-4">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
          {outcome.icon}
        </svg>
        <div className="min-w-0 grow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xl font-bold text-ink">{TOOL_PLAIN[call.tool] ?? call.tool}</span>
            <GuardBadge outcome={call.guardOutcome} />
          </div>
          <div className="mt-1 text-base font-bold">{outcome.label}</div>
          {to && <div className="mt-1 text-base text-ink">To: {to}</div>}
          <p className="mt-2 text-base leading-relaxed text-ink-dim">{call.guardReason}</p>
          {call.guardOutcome === "REQUIRE_APPROVAL" && (
            <Link href="/reviews" className="mt-2 inline-block text-base font-bold text-link hover:underline">
              Held for approval: open the review queue →
            </Link>
          )}
          {(call.checks.length > 0 || Object.keys(call.args).length > 0) && (
            <details className="mt-3 text-ink">
              <summary className="cursor-pointer text-base font-bold">Guard checks and inputs</summary>
              {call.checks.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-[15px]">
                  {call.checks.map((check) => (
                    <li key={check.checkId} className="flex gap-2">
                      <span className={check.passed ? "text-[color:var(--band-low)]" : "text-[color:var(--band-critical)]"} aria-label={check.passed ? "passed" : "failed"}>
                        {check.passed ? "✓" : "✗"}
                      </span>
                      <span>
                        <b>{check.checkId}</b> {CHECK_PLAIN[check.checkId] ?? ""} <span className="text-ink-dim">{check.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {Object.keys(call.args).length > 0 && (
                <pre className="mt-3 overflow-x-auto rounded-xl bg-canvas p-3 text-[14px] text-ink-dim">{JSON.stringify(call.args, null, 2)}</pre>
              )}
            </details>
          )}
        </div>
      </div>
    </li>
  );
}
