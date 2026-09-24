import { ingestHtml } from "./html.js";
import type { IngestAdapter } from "./types.js";

/**
 * Raw shape for `contentType: "email"`. Full RFC 822 / MIME parsing is out
 * of scope for the hackathon build — the ingest boundary (adapters here)
 * and everything downstream only need headers plus a text or HTML body, so
 * callers (the mail fetcher, the seeded demo inbox) send this shape
 * directly instead of a raw MIME blob. [DECISION]
 */
export interface RawEmail {
  from: string;
  subject: string;
  replyTo?: string;
  bodyText?: string;
  bodyHtml?: string;
}

/**
 * Headers plus body, per docs/architecture/LLD.md §3.1. Hidden-text
 * extraction only applies to the HTML body — delegated to the html adapter
 * — headers are treated as visible so detectors can see mismatched
 * Reply-To addresses and similar phishing signals.
 */
export const ingestEmail: IngestAdapter = (raw) => {
  let email: RawEmail;
  try {
    email = JSON.parse(raw) as RawEmail;
  } catch {
    return { visibleText: raw, hiddenSegments: [] };
  }

  const headerLines = [`From: ${email.from}`, `Subject: ${email.subject}`];
  if (email.replyTo) headerLines.push(`Reply-To: ${email.replyTo}`);

  if (email.bodyHtml) {
    // Hidden-segment offsets are relative to `bodyHtml`, not the raw JSON
    // envelope — the excerpt is what matters for evidence display, not the
    // exact byte position in this outer wrapper.
    const { visibleText, hiddenSegments } = ingestHtml(email.bodyHtml);
    return {
      visibleText: [...headerLines, "", visibleText].join("\n"),
      hiddenSegments,
    };
  }

  return {
    visibleText: [...headerLines, "", email.bodyText ?? ""].join("\n"),
    hiddenSegments: [],
  };
};
