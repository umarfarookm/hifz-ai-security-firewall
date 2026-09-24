# HIFZ AI — Decision Log

Architecture decision records. Each one states what we chose, what we rejected, and why — so a reviewer (or a future us) doesn't have to reverse-engineer the reasoning from code.

---

**ADR-1 — Problem 2, claim F3 × D2**
Rejected: Problem 1 (regulatory compliance).
Reason: reliability is measurable with labelled data, and the scope is tractable for a small team in the available time.

**ADR-2 — TypeScript end-to-end, Next.js on Vercel**
Rejected: Spring Boot + Angular.
Reason: one language and one set of shared types across UI, API, and the firewall packages instead of hand-duplicated DTOs between Java and TypeScript; a JVM process is too heavy to keep warm on a free tier without paying for an always-on instance; React/Next.js was the lower ramp-up cost for the team member newer to the stack; and the JS/TS ecosystem's LLM provider SDKs are more mature, so less time goes to plumbing and more to the detection logic actually being judged. Full comparison table in `docs/architecture/HLD.md` §3.1.

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
Rejected: Render Postgres; a self-managed/dedicated Postgres instance (e.g. AWS RDS or Postgres on a VM).
Reason: [VERIFIED] Render's free Postgres tier expires after 30 days — too short for a multi-week build. Against a dedicated instance: Supabase bundles a managed Postgres with an auto-generated REST API, Auth (used directly for reviewer login, ADR-9), and a Studio UI for inspecting data live during the demo — a self-managed instance would need each of those built or wired up separately, plus its own connection pooler to survive many short-lived serverless connections safely (RDS free tier is also only free for a new account's first 12 months, then billed — a cost risk with no budget). It's still plain Postgres underneath, so this isn't lock-in. Full comparison table in `docs/architecture/HLD.md` §3.1.

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

**ADR-11 — Vercel for hosting**
Rejected: AWS (EC2, ECS, or Lambda + API Gateway).
Reason: Vercel gets us from `git push` to a deployed, HTTPS, CDN-backed URL with zero infrastructure configuration, because it's built by the Next.js team specifically for this framework — a serverless function per API route, automatically. The equivalent on AWS (IAM roles, VPC, API Gateway or ECS task definitions, CloudFront, ACM certs, Route 53) is real infrastructure work that would directly compete with the ~18 days available for the parts of the solution actually being judged (detectors, agents, evaluation). AWS's free tier is also easier to accidentally exceed (an idle EC2 instance, a NAT gateway) for a team without day-to-day AWS cost-management habits — a real risk with no budget to absorb a surprise bill mid-build. Full comparison table in `docs/architecture/HLD.md` §3.1.
