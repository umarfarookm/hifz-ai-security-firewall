"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ReviewItem } from "../../lib/review-store.js";
import { getBrowserSupabase } from "../../lib/supabase-browser.js";
import { ReviewStateBadge } from "../../components/badges.js";
import { ATTACK_PLAIN, CHECK_PLAIN, TOOL_PLAIN } from "../../components/plain-labels.js";

type Filter = "PENDING" | "DECIDED" | "EXPIRED" | "ALL";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "PENDING", label: "Pending" },
  { key: "DECIDED", label: "Decided" },
  { key: "EXPIRED", label: "Expired" },
  { key: "ALL", label: "All" },
];

function matches(item: ReviewItem, filter: Filter): boolean {
  if (filter === "ALL") return true;
  if (filter === "DECIDED") return item.state === "APPROVED" || item.state === "REJECTED";
  return item.state === filter;
}

function timeLeft(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s left`;
}

const fieldControl =
  "h-12 w-full rounded-xl border-2 border-line-strong bg-surface px-4 text-base text-ink transition-colors focus:border-accent";

export default function ReviewsPage() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [now, setNow] = useState(() => Date.now());
  const [session, setSession] = useState<Session | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/reviews?limit=100");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setItems(json.items as ReviewItem[]);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = setInterval(() => void load(), 10_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [load]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const visible = (items ?? []).filter((item) => matches(item, filter));
  const pendingCount = (items ?? []).filter((item) => item.state === "PENDING").length;

  return (
    <div className="rise-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-4xl">Review queue</h1>
          <p className="mt-2 max-w-3xl text-lg leading-relaxed text-ink-dim">
            When the firewall is not sure, or the assistant wants to do something risky, it waits here for a person. Content it flagged for REVIEW and tool calls the Action Guard held both land in this queue.
            Anyone can look; approving or rejecting needs a reviewer account. An item nobody decides in 15 minutes expires and counts as rejected.
          </p>
        </div>
        <ReviewerPanel session={session} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`inline-flex min-h-11 items-center rounded-xl border-2 px-4 text-base font-bold transition-colors hover:border-accent hover:bg-accent-tint ${
              filter === f.key ? "border-accent bg-accent-tint text-ink" : "border-line bg-surface text-ink"
            }`}
          >
            {f.label}
            {f.key === "PENDING" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {loadError && <p className="mt-4 text-[16px] text-[color:var(--band-critical)]">Could not load the queue: {loadError}</p>}
      {!items && !loadError && <p className="mt-4 text-[16px] text-ink-faint">Loading…</p>}
      {items && visible.length === 0 && (
        <div className="mt-4 rounded-3xl border-2 border-dashed border-line p-12 text-center text-lg text-ink-dim">
          {filter === "PENDING" ? "Nothing is waiting for review." : "Nothing to show here."}
        </div>
      )}

      <div className="mt-5 space-y-5">
        {visible.map((item) => (
          <ReviewCard key={item.id} item={item} now={now} session={session} onDecided={load} />
        ))}
      </div>
    </div>
  );
}

function ReviewerPanel({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await getBrowserSupabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setPassword("");
      setOpen(false);
    }
  }

  if (session) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-4 py-4 text-base text-ink-dim">
        <div>
          Signed in as <span className="text-ink">{session.user.email}</span>
        </div>
        <button type="button" onClick={() => void getBrowserSupabase().auth.signOut()} className="mt-1.5 font-bold text-link hover:underline">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[300px]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-12 items-center rounded-xl border-2 border-line-strong px-4 text-base font-bold text-ink transition-colors hover:border-accent hover:bg-accent-tint"
        >
          Reviewer sign in
        </button>
      ) : (
        <form onSubmit={signIn} className="space-y-3 rounded-3xl border border-line bg-surface p-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="username" className={fieldControl} />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className={fieldControl}
          />
          {error && <p className="text-base text-[color:var(--band-critical)]">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent px-6 py-3 text-[16px] font-bold text-ink transition-colors duration-150 hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}

function ReviewCard({ item, now, session, onDecided }: { item: ReviewItem; now: number; session: Session | null; onDecided: () => Promise<void> }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function decide(decision: "approve" | "reject") {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/reviews/${item.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) setMessage({ ok: false, text: json.error ?? `HTTP ${res.status}` });
      else {
        setMessage({ ok: true, text: json.effect as string });
        await onDecided();
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const summary = item.summary;
  const pending = item.state === "PENDING";

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ReviewStateBadge state={item.state} />
          <span className="text-[15px] font-bold uppercase tracking-wide text-ink-dim">{item.kind === "tool_call" ? "Tool call held for approval" : "Content flagged for review"}</span>
        </div>
        <span className="font-mono text-[15px] font-bold text-ink-dim">
          {pending ? timeLeft(item.expiresAt, now) : new Date(item.decidedAt ?? item.expiresAt).toLocaleTimeString()}
        </span>
      </div>

      {summary?.type === "tool_call" && (
        <div className="mt-4 space-y-2 text-[16px]">
          <div className="text-xl font-bold text-ink">
            {TOOL_PLAIN[summary.tool] ?? summary.tool}
            {summary.to ? <span className="font-normal text-ink-dim"> to {summary.to}</span> : null}
          </div>
          {summary.preview && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-xl border border-line bg-canvas p-3 font-mono text-[14px] leading-relaxed text-ink">
              {summary.preview}
            </pre>
          )}
          {summary.failedCheck && (
            <p className="text-base text-ink-dim">
              <b className="text-ink">{summary.failedCheck.checkId}</b> {CHECK_PLAIN[summary.failedCheck.checkId] ?? ""} {summary.failedCheck.detail}
            </p>
          )}
          {summary.triggeredBy.length > 0 && <p className="font-mono text-[14px] text-ink-faint">after reading: {summary.triggeredBy.join(", ")}</p>}
        </div>
      )}

      {summary?.type === "content" && (
        <div className="mt-4 space-y-2 text-[16px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base font-bold text-ink">
            <span>Risk {summary.finalBand.toLowerCase()}</span>
            <span>score {summary.score}</span>
          </div>
          {summary.attackTypes.length > 0 && (
            <ul className="space-y-1 text-base text-ink-dim">
              {summary.attackTypes.map((t) => (
                <li key={t}>
                  <span className="font-mono">{t}</span>: {ATTACK_PLAIN[t] ?? ""}
                </li>
              ))}
            </ul>
          )}
          <p className="text-base text-ink-dim">{summary.reason}</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-xl border border-line bg-canvas p-3 font-mono text-[14px] leading-relaxed text-ink">
            {summary.excerpt}
          </pre>
        </div>
      )}

      {!summary && <p className="mt-4 text-base text-ink-dim">The item this review refers to is no longer available.</p>}

      {item.state !== "PENDING" && item.state !== "EXPIRED" && item.comment && <p className="mt-3 text-base text-ink-dim">Reviewer comment: {item.comment}</p>}
      {item.state === "EXPIRED" && <p className="mt-3 text-base text-ink-dim">No decision in time, so this is treated as rejected.</p>}

      {pending && (
        <div className="mt-4 border-t border-line pt-4">
          {session ? (
            <div className="space-y-2">
              <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Comment (optional)" className={fieldControl} />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("approve")}
                  className="inline-flex h-12 items-center rounded-xl bg-accent px-6 text-lg font-bold text-ink transition-colors duration-150 hover:bg-accent-hover disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("reject")}
                  className="inline-flex h-12 items-center rounded-xl border-2 border-line-strong px-6 text-lg font-bold text-ink transition-colors duration-150 hover:border-accent hover:bg-accent-tint disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <p className="text-base text-ink-dim">Sign in as a reviewer to approve or reject this item.</p>
          )}
        </div>
      )}

      {message && <p className={`mt-3 text-base ${message.ok ? "text-ink-dim" : "text-[color:var(--band-critical)]"}`}>{message.text}</p>}
    </section>
  );
}
