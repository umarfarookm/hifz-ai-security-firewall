import type { InspectResponseBody } from "../lib/inspect.js";

type Step = { title: string; detail: string; done: boolean };

function steps(result: InspectResponseBody): Step[] {
  const warnings = result.signals.length;
  const llm = result.llmStatus;
  const second: Step =
    (llm === "ok" || llm === "cached") && result.verdict
      ? { title: "Second opinion", detail: result.verdict.isInjection ? "Another AI reviewed it and agreed it is an attack." : "Another AI reviewed it and found no attack.", done: true }
      : llm === "not_called"
        ? { title: "Second opinion", detail: "Not needed: the answer was already clear.", done: false }
        : { title: "Second opinion", detail: "Not available, so we played it safe.", done: false };
  return [
    { title: "Read it", detail: result.extracted ? "Read the file, including any hidden text." : "Read the text you added.", done: true },
    { title: "Looked for tricks", detail: warnings === 0 ? "No warning signs matched." : `${warnings} warning sign${warnings === 1 ? "" : "s"} matched.`, done: true },
    second,
    { title: "Decided", detail: "Picked safe, cleaned, held for a person, or blocked.", done: true },
  ];
}

export function HowWeChecked({ result }: { result: InspectResponseBody }) {
  return (
    <section aria-label="How we checked it">
      <h2 className="text-2xl font-extrabold tracking-tight text-ink">How we checked it</h2>
      <ol className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {steps(result).map((s) => (
          <li key={s.title} className="rounded-2xl border border-line bg-surface p-4">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={s.done ? "var(--band-low)" : "var(--color-ink-dim)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              {s.done ? <path d="M8 12l3 3 5-6" /> : <path d="M8 12h8" />}
            </svg>
            <div className="mt-3 text-lg font-bold leading-tight text-ink">{s.title}</div>
            <p className="mt-1 text-[15px] leading-snug text-ink-dim">{s.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
