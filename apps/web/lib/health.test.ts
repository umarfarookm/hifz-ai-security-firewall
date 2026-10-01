import type { Env } from "@hifz/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryAuditWriter } from "./audit.js";
import { buildHealth } from "./health.js";
import { resetGatewayLogState } from "./gateway.js";

const env = (overrides: Partial<Env> = {}) =>
  ({ INVESTIGATOR_PROVIDER: "none", DEMO_AGENT_PROVIDER: "none", OLLAMA_BASE_URL: "http://localhost:11434/v1", ...overrides }) as Env;

describe("buildHealth", () => {
  beforeEach(() => resetGatewayLogState());
  afterEach(() => vi.restoreAllMocks());

  it("is ok with HTTP 200 when the database answers and the LLM roles are fine or intentionally off", async () => {
    const audit = new InMemoryAuditWriter();
    const { httpStatus, body } = await buildHealth({ ping: () => audit.ping(), env: env(), correlationId: "c-1", now: () => new Date("2026-10-01T05:17:00Z") });

    expect(httpStatus).toBe(200);
    expect(body).toMatchObject({ status: "ok", db: "up", investigatorLlm: "rules_only", demoAgentLlm: "rules_only", correlationId: "c-1", timestamp: "2026-10-01T05:17:00.000Z" });
  });

  it("never writes: the check is a read-only ping, so a public or daily call cannot grow a table (regression: it used to insert a sessions row per call)", async () => {
    const audit = new InMemoryAuditWriter();
    await buildHealth({ ping: () => audit.ping(), env: env(), correlationId: "c" });
    await buildHealth({ ping: () => audit.ping(), env: env(), correlationId: "c" });

    expect(audit.pings).toBe(2);
    expect(audit.sessions.size).toBe(0);
    expect(audit.inspections).toHaveLength(0);
    expect(audit.toolCalls).toHaveLength(0);
  });

  it("returns 503 and status degraded when the database is down, so a failed keep-alive is a failed cron run", async () => {
    const { httpStatus, body } = await buildHealth({
      ping: async () => {
        throw new Error("connection refused");
      },
      env: env(),
      correlationId: "c",
    });

    expect(httpStatus).toBe(503);
    expect(body).toMatchObject({ status: "degraded", db: "down" });
  });

  it("stays HTTP 200 but reports degraded when an LLM role is misconfigured: the service still works, rules-only", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { httpStatus, body } = await buildHealth({
      ping: async () => {},
      env: env({ INVESTIGATOR_PROVIDER: "deepseek", INVESTIGATOR_MODEL: "deepseek-flash" }), // no key
      correlationId: "c",
    });

    expect(httpStatus).toBe(200);
    expect(body).toMatchObject({ status: "degraded", db: "up", investigatorLlm: "misconfigured" });
  });

  it("does not leak the reason for a misconfiguration (status only)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { body } = await buildHealth({ ping: async () => {}, env: env({ INVESTIGATOR_PROVIDER: "deepseek", INVESTIGATOR_MODEL: "m" }), correlationId: "c" });
    expect(JSON.stringify(body)).not.toMatch(/API_KEY|must be set/i);
  });
});

describe("vercel.json", () => {
  it("schedules exactly one daily job against /api/v1/health (free plans allow at most one run per day)", async () => {
    const { readFileSync } = await import("node:fs");
    const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: Array<{ path: string; schedule: string }> };

    expect(config.crons).toHaveLength(1);
    expect(config.crons[0]!.path).toBe("/api/v1/health");
    // minute hour day-of-month month day-of-week: fixed minute and hour, wildcards elsewhere = once a day
    expect(config.crons[0]!.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
  });
});
