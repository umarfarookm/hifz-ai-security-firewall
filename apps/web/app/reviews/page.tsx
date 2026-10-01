"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ReviewItem } from "../../lib/review-store.js";
import { getBrowserSupabase } from "../../lib/supabase-browser.js";
import { ReviewStateBadge } from "../../components/badges.js";

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
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors duration-150 focus:border-accent/50";

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
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-ink">Review queue</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-dim">
            Anything the firewall is not willing to decide alone lands here: content it flagged for REVIEW, and tool calls the Action Guard held for approval.
            Anyone can read the queue; approving or rejecting needs a reviewer account. An item nobody decides in 15 minutes expires and counts as rejected.
          </p>
        </div>
        <ReviewerPanel session={session} />
      </div>

      <div className="mt-8 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors duration-150 hover:border-line-strong hover:text-ink ${
              filter === f.key ? "border-line-strong text-ink" : "border-line text-ink-dim"
            }`}
          >
            {f.label}
            {f.key === "PENDING" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {loadError && <p className="mt-6 text-[13px] text-[color:var(--band-critical)]">Could not load the queue: {loadError}</p>}
      {!items && !loadError && <p className="mt-6 text-[13px] text-ink-faint">Loading…</p>}
      {items && visible.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-line p-10 text-center text-[13px] text-ink-faint">
          {filter === "PENDING" ? "Nothing is waiting for review." : "Nothing to show here."}
        </div>
      )}

      <div className="mt-6 space-y-3">
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
      <div className="rounded-lg border border-line bg-surface px-4 py-3 text-[12px] text-ink-dim">
        <div>
          Signed in as <span className="text-ink">{session.user.email}</span>
        </div>
        <button type="button" onClick={() => void getBrowserSupabase().auth.signOut()} className="mt-1.5 text-accent hover:underline">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[260px]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink-dim transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          Reviewer sign in
        </button>
      ) : (
        <form onSubmit={signIn} className="space-y-2 rounded-lg border border-line bg-surface p-4">
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
          {error && <p className="text-[12px] text-[color:var(--band-critical)]">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-ink px-3 py-2 text-[13px] font-medium text-canvas transition-opacity duration-150 hover:opacity-85 disabled:opacity-40"
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
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ReviewStateBadge state={item.state} />
          <span className="text-[11px] uppercase tracking-wide text-ink-faint">{item.kind === "tool_call" ? "Tool call held for approval" : "Content flagged for review"}</span>
        </div>
        <span className="font-mono text-[11px] text-ink-faint">
          {pending ? timeLeft(item.expiresAt, now) : new Date(item.decidedAt ?? item.expiresAt).toLocaleTimeString()}
        </span>
      </div>

      {summary?.type === "tool_call" && (
        <div className="mt-4 space-y-2 text-[13px]">
          <div className="font-mono text-ink">
            {summary.tool}
            {summary.to ? <span className="text-ink-dim"> → {summary.to}</span> : null}
          </div>
          {summary.preview && (
            <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-dim">
              {summary.preview}
            </pre>
          )}
          {summary.failedCheck && (
            <p className="text-[12px] text-ink-dim">
              <span className="font-mono text-ink">{summary.failedCheck.checkId}</span> {summary.failedCheck.detail}
            </p>
          )}
          {summary.triggeredBy.length > 0 && <p className="font-mono text-[11px] text-ink-faint">after reading: {summary.triggeredBy.join(", ")}</p>}
        </div>
      )}

      {summary?.type === "content" && (
        <div className="mt-4 space-y-2 text-[13px]">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-ink-dim">
            <span>{summary.finalBand}</span>
            <span>score {summary.score}</span>
            {summary.attackTypes.length > 0 && <span>{summary.attackTypes.join(", ")}</span>}
          </div>
          <p className="text-[12px] text-ink-dim">{summary.reason}</p>
          <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-dim">
            {summary.excerpt}
          </pre>
        </div>
      )}

      {!summary && <p className="mt-4 text-[12px] text-ink-faint">The item this review refers to is no longer available.</p>}

      {item.state !== "PENDING" && item.state !== "EXPIRED" && item.comment && <p className="mt-3 text-[12px] text-ink-dim">Reviewer comment: {item.comment}</p>}
      {item.state === "EXPIRED" && <p className="mt-3 text-[12px] text-ink-faint">No decision in time, so this is treated as rejected.</p>}

      {pending && (
        <div className="mt-4 border-t border-line pt-4">
          {session ? (
            <div className="space-y-2">
              <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Comment (optional)" className={fieldControl} />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("approve")}
                  className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-canvas transition-opacity duration-150 hover:opacity-85 disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("reject")}
                  className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink-dim transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-ink-faint">Sign in as a reviewer to approve or reject this item.</p>
          )}
        </div>
      )}

      {message && <p className={`mt-3 text-[12px] ${message.ok ? "text-ink-dim" : "text-[color:var(--band-critical)]"}`}>{message.text}</p>}
    </section>
  );
}
