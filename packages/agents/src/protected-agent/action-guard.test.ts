import { describe, expect, it } from "vitest";
import type { ToolCallRequest } from "@hifz/firewall-core";
import { runActionGuard, type ActionGuardContext } from "./action-guard.js";

function request(overrides: Partial<ToolCallRequest> = {}): ToolCallRequest {
  return {
    tool: "send_email",
    args: { to: "someone@hifz-demo.test", subject: "hi", body: "hello" },
    sessionId: "session-1",
    triggeringContentIds: ["content-1"],
    ...overrides,
  };
}

function cleanContext(overrides: Partial<ActionGuardContext> = {}): ActionGuardContext {
  return {
    triggeringBands: ["LOW"],
    anyTriggeringContentUntrusted: false,
    recentHighRiskCallCount: 0,
    knownSecrets: [],
    ...overrides,
  };
}

describe("Action Guard", () => {
  describe("G1 — tool allowlist", () => {
    it("passes for a tool on the allowlist", () => {
      const decision = runActionGuard(request({ tool: "read_inbox", args: {} }), cleanContext());
      expect(decision.checks.find((c) => c.checkId === "G1")!.passed).toBe(true);
    });

    it("fails (BLOCK) for a tool not on the allowlist", () => {
      const decision = runActionGuard(request({ tool: "delete_all_files", args: {} }), cleanContext());
      expect(decision.outcome).toBe("BLOCK");
      expect(decision.checks.find((c) => c.checkId === "G1")!.passed).toBe(false);
      expect(decision.checks).toHaveLength(1); // first failure stops the chain
    });
  });

  describe("G2 — parameter schema", () => {
    it("passes when arguments match the tool's schema", () => {
      const decision = runActionGuard(request({ tool: "read_inbox", args: {} }), cleanContext());
      expect(decision.checks.find((c) => c.checkId === "G2")!.passed).toBe(true);
    });

    it("fails (BLOCK) when a required argument is missing", () => {
      const decision = runActionGuard(request({ tool: "send_email", args: { to: "x@hifz-demo.test" } }), cleanContext());
      expect(decision.outcome).toBe("BLOCK");
      expect(decision.checks.find((c) => c.checkId === "G2")!.passed).toBe(false);
    });
  });

  describe("G3 — destination allowlist", () => {
    it("passes for a destination on the allowlist", () => {
      const decision = runActionGuard(request({ args: { to: "user@hifz-demo.test", subject: "s", body: "b" } }), cleanContext());
      expect(decision.checks.find((c) => c.checkId === "G3")!.passed).toBe(true);
      expect(decision.outcome).toBe("EXECUTE");
    });

    it("requires approval for a destination outside the allowlist", () => {
      const decision = runActionGuard(request({ args: { to: "user@external.example", subject: "s", body: "b" } }), cleanContext());
      expect(decision.outcome).toBe("REQUIRE_APPROVAL");
      expect(decision.checks.find((c) => c.checkId === "G3")!.passed).toBe(false);
    });

    it("does not apply to tools with no destination field", () => {
      const decision = runActionGuard(request({ tool: "read_inbox", args: {} }), cleanContext());
      expect(decision.checks.find((c) => c.checkId === "G3")!.passed).toBe(true);
    });
  });

  describe("G4 — outbound secret scan", () => {
    it("passes when no secret-shaped value is present", () => {
      const decision = runActionGuard(request(), cleanContext());
      expect(decision.checks.find((c) => c.checkId === "G4")!.passed).toBe(true);
    });

    it("fails (BLOCK) when a known fake secret appears in the arguments", () => {
      const decision = runActionGuard(
        request({ args: { to: "user@hifz-demo.test", subject: "s", body: "the password is hifz-demo-password" } }),
        cleanContext({ knownSecrets: ["hifz-demo-password"] }),
      );
      expect(decision.outcome).toBe("BLOCK");
      expect(decision.checks.find((c) => c.checkId === "G4")!.passed).toBe(false);
    });

    it("fails (BLOCK) on a generically secret-shaped value even if it's not in the known-secrets list", () => {
      const decision = runActionGuard(
        request({ args: { to: "user@hifz-demo.test", subject: "s", body: "key: sk-abcdefghijklmnopqrstuvwx" } }),
        cleanContext(),
      );
      expect(decision.outcome).toBe("BLOCK");
      expect(decision.checks.find((c) => c.checkId === "G4")!.passed).toBe(false);
    });
  });

  describe("G5 — taint check", () => {
    it("passes when triggering content is clean and trusted", () => {
      const decision = runActionGuard(request(), cleanContext({ triggeringBands: ["LOW"], anyTriggeringContentUntrusted: false }));
      expect(decision.checks.find((c) => c.checkId === "G5")!.passed).toBe(true);
      expect(decision.outcome).toBe("EXECUTE");
    });

    it("requires approval for a high-risk tool when triggering content is untrusted", () => {
      const decision = runActionGuard(request({ tool: "send_email" }), cleanContext({ anyTriggeringContentUntrusted: true }));
      expect(decision.outcome).toBe("REQUIRE_APPROVAL");
      expect(decision.checks.find((c) => c.checkId === "G5")!.passed).toBe(false);
    });

    it("blocks a critical-risk tool when triggering content is untrusted", () => {
      const decision = runActionGuard(
        request({ tool: "read_secrets", args: { name: "db_password" } }),
        cleanContext({ anyTriggeringContentUntrusted: true }),
      );
      expect(decision.outcome).toBe("BLOCK");
    });

    it("requires approval when the triggering content band is MEDIUM or higher, even from a trusted source", () => {
      const decision = runActionGuard(request(), cleanContext({ triggeringBands: ["MEDIUM"], anyTriggeringContentUntrusted: false }));
      expect(decision.outcome).toBe("REQUIRE_APPROVAL");
      expect(decision.checks.find((c) => c.checkId === "G5")!.passed).toBe(false);
    });

    it("never taints a low-risk tool, regardless of band or trust", () => {
      const decision = runActionGuard(
        request({ tool: "read_inbox", args: {} }),
        cleanContext({ triggeringBands: ["CRITICAL"], anyTriggeringContentUntrusted: true }),
      );
      expect(decision.outcome).toBe("EXECUTE");
      expect(decision.checks.find((c) => c.checkId === "G5")!.passed).toBe(true);
    });
  });

  describe("G6 — per-session rate limit", () => {
    it("passes within the rate limit", () => {
      const decision = runActionGuard(request(), cleanContext({ recentHighRiskCallCount: 2 }));
      expect(decision.checks.find((c) => c.checkId === "G6")!.passed).toBe(true);
      expect(decision.outcome).toBe("EXECUTE");
    });

    it("requires approval once the high-risk rate limit is exceeded", () => {
      const decision = runActionGuard(request(), cleanContext({ recentHighRiskCallCount: 4 }));
      expect(decision.outcome).toBe("REQUIRE_APPROVAL");
      expect(decision.checks.find((c) => c.checkId === "G6")!.passed).toBe(false);
    });

    it("does not rate-limit low-risk tools", () => {
      const decision = runActionGuard(request({ tool: "read_inbox", args: {} }), cleanContext({ recentHighRiskCallCount: 10 }));
      expect(decision.outcome).toBe("EXECUTE");
    });
  });

  it("executes when every check passes", () => {
    const decision = runActionGuard(request(), cleanContext());
    expect(decision.outcome).toBe("EXECUTE");
    expect(decision.checks.every((c) => c.passed)).toBe(true);
    expect(decision.checks.map((c) => c.checkId)).toEqual(["G1", "G2", "G3", "G4", "G5", "G6"]);
  });
});
