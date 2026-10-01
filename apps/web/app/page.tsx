import Link from "next/link";

const SCREENS = [
  {
    href: "/dashboard",
    title: "Dashboard",
    description: "Live counters, the risk-band distribution, the latest events and the latest held-out results, all read from the audit log.",
  },
  {
    href: "/playground",
    title: "Playground",
    description: "Paste content, choose its type and source, and see the firewall's decision, score breakdown, and evidence in real time.",
  },
  {
    href: "/agent",
    title: "Agent demo",
    description: "HIFZ Mail, a protected email assistant. Watch the Action Guard intercept every tool call it proposes, in real time.",
  },
  {
    href: "/scenarios",
    title: "Scenarios",
    description: "One scripted attack per committed type. Replay any of them, or all seven, through the live pipeline.",
  },
  {
    href: "/reviews",
    title: "Review queue",
    description: "Content the firewall flagged and tool calls the Action Guard held. A reviewer approves or rejects; undecided items expire after 15 minutes.",
  },
  {
    href: "/evaluation",
    title: "Evaluation",
    description: "Detection and false-positive rates from the dataset runner, rules-only against rules + LLM, read from recorded runs.",
  },
];

export default function HomePage() {
  return (
    <div className="rise-in">
      <div className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[11px] uppercase tracking-wide text-ink-dim">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        Agentic security firewall
      </div>

      <h1 className="mt-5 max-w-xl text-[2.75rem] font-medium leading-[1.1] tracking-tight text-ink">
        Inspect untrusted content <span className="text-ink-faint">before</span> it can influence an AI agent.
      </h1>

      <p className="mt-5 max-w-lg text-[14px] leading-relaxed text-ink-dim">
        Seven committed attack types, detected at the content stage. Rule detectors first, an investigator LLM only when the score lands
        in the escalation band, and a deterministic Action Guard as the second line of defense.
      </p>

      <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SCREENS.map((screen) => (
          <Link
            key={screen.href}
            href={screen.href}
            className="group rounded-lg border border-line bg-surface p-6 transition-colors duration-150 hover:border-line-strong hover:bg-surface-raised"
          >
            <div className="flex items-center justify-between text-[14px] font-medium text-ink">
              {screen.title}
              <span className="text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent">
                →
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">{screen.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
