# Official requirements — source of truth

Summarised from the ET AI Hackathon: Agentic Edition problem statement PDF and the Unstop Phase 2 page.
**If anything in this repository conflicts with this file, this file wins.** Do not reinterpret these requirements — if something is unclear, treat it as an open question, not an assumption.

## Problem 2 — Agentic Cybersecurity: Prompt Injection Firewall

- Design a firewall that intercepts **all incoming content before it influences the AI's behaviour**.
- It must **detect and neutralize** malicious prompt injections, **while allowing legitimate content to pass with minimal disruption**.

**Input sources the firewall may receive:** user messages, web pages, PDFs, emails, Markdown, HTML, Word documents, API responses, OCR text, source code, images (via OCR).

**Attack types to detect:**

1. Instruction Override
2. Role Change
3. Secret Extraction
4. Tool Abuse
5. Credential Theft
6. Context Poisoning
7. Multi-Step Jailbreaks
8. Encoded Instructions
9. Indirect Prompt Injection

## Solution grid (3×3)

| Level | Definition |
|---|---|
| F1 / F2 / F3 | Detect at least 2 / 5 / 7 attack types |
| D1 | Mostly structured/textual input; acceptable outputs in a majority of situations |
| D2 | Mostly structured/textual input; high degree of demonstrable reliability |
| D3 | Highly heterogeneous multimodal input; high degree of demonstrable reliability |

- Teams must **declare their self-estimated grid position and justify it** in the final submission.
- **Overestimation and underestimation are both penalized.**
- Solutions with greater coverage are rewarded.

**Our claim: F3 × D2.** Committed types: Instruction Override, Role Change, Secret Extraction, Tool Abuse, Credential Theft, Encoded Instructions, Indirect Prompt Injection. Context Poisoning and Multi-Step Jailbreaks are stretch goals — never claimed unless a formal evaluation gate says otherwise.

## Evaluation criteria

1. Significance and relevance
2. Innovation and originality
3. Effective use of AI (central to the solution, not bolted on)
4. Technical complexity and execution
5. Agentic / autonomous capability — reason, plan, use tools, take actions, recover from errors, appropriate autonomy
6. Business / user impact
7. Prototype quality and usability — does it actually work? Is it intuitive and demonstrable?
8. Scalability, responsible AI and robustness — hallucination, security, privacy, bias, reliability, human oversight

## Final submission expectations

1. **Working demo** — must show the solution working across **every area the team claims**.
2. **Detailed structural architecture** — process flow, key decisions, model usage, and how the architecture supports what's shown in the demo.

## Phase 2 deliverables (Unstop)

- Working prototype — **public GitHub repository URL**
- Pitch deck — PDF or PowerPoint (exclude cover and thank-you slides from the content)
- **2–4 minute** demo video
- Accessible demo link
- Submission window: **23 Sep 2026, 11:00 AM IST → 11 Oct 2026, 11:59 PM IST**. No extensions.

## Rules that affect engineering

- Plagiarism results in disqualification. Attribute every public dataset and third-party snippet used.
- Open-source tools and AI models are allowed.
