"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MetricsBody } from "../lib/metrics.js";

const STEPS = [
  { title: "We read everything", body: "Even text hidden inside a Word file, or written inside a picture." },
  { title: "We look for tricks", body: "Commands that try to take control of an AI assistant." },
  { title: "We get a second opinion", body: "For unclear cases, another AI reviews it. It can only make us more careful, never less." },
  { title: "You get a clear answer", body: "Safe, held for a person, or blocked, with the reason in plain words." },
] as const;

/** The seven attack types the firewall commits to detecting, in plain words. */
const ATTACKS = [
  { title: "Instruction override", body: "Tells the AI to ignore its rules." },
  { title: "Role change", body: "Tries to change who the AI thinks it is." },
  { title: "Secret extraction", body: "Tries to get the AI to reveal secrets." },
  { title: "Tool abuse", body: "Tries to make the AI use its tools to do harm." },
  { title: "Credential theft", body: "Asks for passwords or keys." },
  { title: "Encoded instructions", body: "Hides a command in encoded text." },
  { title: "Indirect prompt injection", body: "Hides a command in content the AI is asked to read." },
] as const;

/** One real sentence from the audit log. Shows nothing if the numbers cannot be loaded. */
function LiveCounts() {
  const [metrics, setMetrics] = useState<MetricsBody | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/metrics")
      .then((r) => (r.ok ? (r.json() as Promise<MetricsBody>) : null))
      .then((m) => {
        if (!cancelled && m) setMetrics(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (!metrics) return null;
  const { totalInspections: total, byAction } = metrics.counters;
  return (
    <section aria-label="So far on this site" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-3xl border border-line bg-surface px-7 py-6">
      <div className="text-xl font-bold text-ink">So far on this site</div>
      <p className="grow text-xl text-ink-dim">
        {total === 0 ? (
          "Nothing has been checked yet."
        ) : (
          <>
            {total} {total === 1 ? "item" : "items"} checked: {byAction.ALLOW} safe, {byAction.SANITIZE} cleaned, {byAction.REVIEW} sent to a person to review, {byAction.BLOCK} blocked.
          </>
        )}{" "}
        <Link href="/dashboard" className="font-bold text-link hover:underline">
          See the full history
        </Link>
      </p>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="rise-in">
      <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.06] tracking-tight text-ink sm:text-7xl">Is this safe for your AI to read?</h1>
      <p className="mt-6 max-w-3xl text-2xl leading-relaxed text-ink-dim">
        Add a message, a document or a picture. We look for hidden commands that try to take over your AI assistant, before it ever sees them.
      </p>
      <div className="mt-9 flex flex-wrap gap-4">
        <Link
          href="/playground"
          className="inline-flex h-16 items-center rounded-2xl bg-accent px-10 text-2xl font-bold text-ink transition-colors hover:bg-accent-hover"
        >
          Check something
        </Link>
        <Link
          href="/agent"
          className="inline-flex h-16 items-center rounded-2xl border-2 border-line-strong bg-surface px-8 text-2xl font-bold text-ink transition-colors hover:border-accent hover:bg-accent-tint"
        >
          Watch the protected assistant
        </Link>
      </div>

      <h2 className="mt-24 text-4xl font-extrabold tracking-tight text-ink">What happens when you press Check</h2>
      <ol className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-3xl border border-line bg-surface p-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-tint text-2xl font-extrabold text-ink">{i + 1}</div>
            <div className="mt-5 text-2xl font-bold leading-tight text-ink">{s.title}</div>
            <p className="mt-2 text-lg leading-relaxed text-ink-dim">{s.body}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-24 text-4xl font-extrabold tracking-tight text-ink">Seven kinds of attack we catch</h2>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ATTACKS.map((a) => (
          <li key={a.title} className="rounded-2xl border border-line bg-surface p-6">
            <div className="text-xl font-bold text-ink">{a.title}</div>
            <p className="mt-1 text-lg leading-snug text-ink-dim">{a.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-16">
        <LiveCounts />
      </div>
    </div>
  );
}
