"use client";

import type { InspectResponseBody } from "../lib/inspect.js";
import { ATTACK_PLAIN } from "./plain-labels.js";
import { BAND_WORD, COPY } from "./verdict-banner.js";

type Decision = InspectResponseBody["decision"];

/** Short labels for the compact panel. Different wording from the full banner on purpose, so the two never read as a duplicate. */
const SHORT: Record<Decision, string> = {
  ALLOW: "Safe",
  SANITIZE: "Cleaned first",
  REVIEW: "Held for a person",
  BLOCK: "Blocked",
};

const frame = "rounded-3xl border-2 p-5 sm:p-6";

export interface ResultPanelProps {
  loading: boolean;
  hasError: boolean;
  result: InspectResponseBody | null;
  /** The id of the full result section to scroll to. */
  targetId: string;
}

/**
 * A small summary that sits beside the input, so the answer is visible without scrolling.
 * The full result below the examples is unchanged; this only points at it.
 */
export function ResultPanel({ loading, hasError, result, targetId }: ResultPanelProps) {
  function scrollToFull() {
    const el = document.getElementById(targetId);
    if (!el) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }

  let body: React.ReactNode;
  let tone = "border-line bg-surface";

  if (loading) {
    body = (
      <div data-testid="result-panel-loading">
        <p className="text-xl font-extrabold text-ink">Looking at it…</p>
        <div className="mt-4 space-y-3" aria-hidden>
          <div className="h-3 w-5/6 animate-pulse rounded bg-line" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-line" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-line" />
        </div>
      </div>
    );
  } else if (result) {
    const copy = COPY[result.decision];
    tone = copy.tone;
    const found = result.attackTypes.map((t) => ATTACK_PLAIN[t]).filter((t): t is string => Boolean(t)).slice(0, 2);
    body = (
      <div data-testid="result-panel-done">
        <div className="flex items-start gap-3">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
            {copy.icon}
          </svg>
          <div className="min-w-0">
            <p className="text-xl font-extrabold leading-tight text-ink">{SHORT[result.decision]}</p>
            <p className="mt-1 text-base text-ink-dim">
              Risk: {BAND_WORD[result.finalBand]} · {result.score} / 100
            </p>
          </div>
        </div>
        <p className="mt-4 text-lg leading-relaxed text-ink">{found.length > 0 ? found.join(" ") : "Nothing in it tries to control your AI."}</p>
        {result.verdict && <p className="mt-2 text-base text-ink-dim">A second AI also reviewed it.</p>}
        <button type="button" onClick={scrollToFull} className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-lg text-base font-bold text-link hover:underline">
          See the full result <span aria-hidden>↓</span>
        </button>
      </div>
    );
  } else if (hasError) {
    body = (
      <div data-testid="result-panel-error">
        <p className="text-xl font-extrabold text-ink">We could not run this check.</p>
        <p className="mt-2 text-base text-ink-dim">The reason is shown below the examples.</p>
      </div>
    );
  } else {
    body = (
      <div data-testid="result-panel-idle">
        <p className="text-xl font-extrabold text-ink">Your answer appears here.</p>
        <p className="mt-2 text-base leading-relaxed text-ink-dim">Pick an example or add your own, then run the check. You will see the short answer here, and the full story below.</p>
      </div>
    );
  }

  return (
    <div aria-live="polite" aria-atomic="true" className={`${frame} ${tone} lg:sticky lg:top-6`} data-testid="result-panel">
      {body}
    </div>
  );
}
