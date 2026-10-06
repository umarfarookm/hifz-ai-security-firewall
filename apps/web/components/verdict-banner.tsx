import Link from "next/link";
import type { InspectResponseBody } from "../lib/inspect.js";
import { ActionBadge } from "./badges.js";
import { ATTACK_PLAIN } from "./plain-labels.js";

type Decision = InspectResponseBody["decision"];

/** Plain-English wording for a decision. The technical label (ALLOW, BLOCK ...) is still shown beside it. */
export const COPY: Record<Decision, { title: string; body: string; tone: string; icon: React.ReactNode }> = {
  ALLOW: {
    title: "This looks safe.",
    body: "We found nothing in it that tries to give your AI orders.",
    tone: "border-[color:var(--band-low)]/30 bg-[color:var(--band-low)]/8 text-[color:var(--band-low)]",
    icon: (
      <>
        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
  SANITIZE: {
    title: "We cleaned this up first.",
    body: "Some parts looked risky, so we removed them before your AI could read them.",
    tone: "border-[color:var(--band-medium)]/35 bg-[color:var(--band-medium)]/8 text-[color:var(--band-medium)]",
    icon: (
      <>
        <path d="M12 3L2 21h20z" />
        <path d="M12 10v5M12 18v.5" />
      </>
    ),
  },
  REVIEW: {
    title: "A person should look at this.",
    body: "We could not be sure, so it is held until someone approves or rejects it.",
    tone: "border-[color:var(--band-medium)]/35 bg-[color:var(--band-medium)]/8 text-[color:var(--band-medium)]",
    icon: (
      <>
        <path d="M12 3L2 21h20z" />
        <path d="M12 10v5M12 18v.5" />
      </>
    ),
  },
  BLOCK: {
    title: "This is blocked.",
    body: "It contains instructions that try to take control of an AI assistant. Your AI never sees it.",
    tone: "border-[color:var(--band-critical)]/35 bg-[color:var(--band-critical)]/8 text-[color:var(--band-critical)]",
    icon: (
      <>
        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
        <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
      </>
    ),
  },
};

export const BAND_WORD = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Very high" } as const;

export interface VerdictBannerProps {
  decision: Decision;
  finalBand: InspectResponseBody["finalBand"];
  score: number;
  attackTypes: string[];
  /** When set, the banner links to the full event page. */
  eventId?: string;
  reviewId?: string | null;
}

export function VerdictBanner({ decision, finalBand, score, attackTypes, eventId, reviewId }: VerdictBannerProps) {
  const copy = COPY[decision];
  const found = attackTypes.map((t) => ATTACK_PLAIN[t]).filter((t): t is string => Boolean(t));
  return (
    <section aria-label="Result" className={`rounded-3xl border-2 p-5 sm:p-6 ${copy.tone}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
          {copy.icon}
        </svg>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight tracking-tight text-ink sm:text-2xl">{copy.title}</h2>
          <p className="mt-3 text-lg leading-relaxed text-ink">{copy.body}</p>
          {found.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-base text-ink">
              {found.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-current" />
                  {f}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-base text-ink-dim">
            <ActionBadge action={decision} />
            <span>
              Risk: <b className="text-ink">{BAND_WORD[finalBand]}</b> ({score} out of 100)
            </span>
            {eventId && (
              <Link href={`/events/${eventId}`} className="inline-flex min-h-11 items-center font-bold text-link hover:underline">
                View full event →
              </Link>
            )}
            {reviewId && (
              <Link href="/reviews" className="inline-flex min-h-11 items-center font-bold text-link hover:underline">
                Open the review queue →
              </Link>
            )}
          </div>
          <div className="mt-3 h-3 max-w-md overflow-hidden rounded-full bg-line" role="img" aria-label={`Risk ${score} out of 100`}>
            <div className="h-full rounded-full bg-current" style={{ width: `${Math.max(2, score)}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
