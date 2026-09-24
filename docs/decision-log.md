# HIFZ AI — Decision Log

Architecture decision records. Each one states what we chose, what we rejected, and why — so a reviewer (or a future us) doesn't have to reverse-engineer the reasoning from code.

---

**ADR-1 — Problem 2, claim F3 × D2**
Rejected: Problem 1 (regulatory compliance).
Reason: reliability is measurable with labelled data, and the scope is tractable for a small team in the available time.

**ADR-2 — TypeScript end-to-end, Next.js on Vercel**
Rejected: Spring Boot + Angular.
Reason: single deploy at $0, no JVM memory/cold-start issues, one language across the whole stack.

**ADR-3 — Layered detection: deterministic rules → LLM investigator (escalate-only)**
Rejected: LLM-only classifier.
Reason: an LLM alone is itself injectable, slower, and non-deterministic — it can't be the last word on a security decision.

**ADR-4 — No self-hosted ML classifier in the demo**
Rejected: a fine-tuned classifier (e.g. ProtectAI's DeBERTa model) hosted on Hugging Face or Render.
Reason: [VERIFIED] Hugging Face Docker Spaces require a paid plan for this workload, and the model doesn't fit in Render's free-tier RAM. Not worth the infrastructure cost for a hackathon demo.

**ADR-5 — Provider-switchable LLM layer**
Rejected: a single hard-coded provider.
Reason: resilience against quota limits, and it lets judges see the security logic doesn't depend on one vendor's model.

**ADR-6 — Supabase Postgres**
Rejected: Render Postgres.
Reason: [VERIFIED] Render's free Postgres tier expires after 30 days — too short for a multi-week build.

**ADR-7 — Email-assistant demo agent**
Rejected: a generic chatbot.
Reason: makes indirect injection and tool abuse concrete and visually obvious — a judge can see the attack path in seconds.

**ADR-8 — All 7 committed types detected at the content level; Action Guard is a second line**
Rejected: making the Action Guard the primary detector for Tool Abuse.
Reason: the official requirement is to neutralize malicious instructions *before* they influence the AI's behaviour — detecting only after a tool call is proposed would miss that requirement.

**ADR-9 — Reviewer login via Supabase Auth**
Rejected: a shared admin token.
Reason: a defensible, auditable implementation of the human-oversight requirement, not just a demo shortcut.

**ADR-10 — One deployable app (Next.js UI + API routes as serverless functions), not a separate backend service**
Rejected: a separately hosted agent/API service (e.g. a small Node server on Render/Fly) called by the Next.js frontend.
Reason: `packages/agents` and `packages/firewall-core` are plain libraries with no server of their own — they only run inside a Vercel serverless function for the duration of one request. A separate backend would need its own always-on hosting (breaks the $0 constraint and the "no unnecessary microservices" rule in `CLAUDE.md`), would add a second deployment pipeline and a second place secrets can leak, and buys nothing the serverless model doesn't already provide at this project's traffic scale. See `docs/architecture/HLD.md` §5.1 for the request-flow diagram and full reasoning.
