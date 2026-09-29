import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { POST as inspect } from "../../../inspect/route.js";
import { findScenario } from "../../../../../../lib/scenarios.js";

/**
 * POST /api/v1/scenarios/{id}/replay — docs/architecture/LLD.md §4. Re-runs the scenario through the real
 * /inspect handler (rate limit, audit event and all), so the result is a live run, not a stored one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = findScenario(id);
  if (!scenario) {
    return NextResponse.json({ correlationId: randomUUID(), error: `no scenario with id "${id}"` }, { status: 404 });
  }

  const forwarded = req.headers.get("x-forwarded-for");
  return inspect(
    new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(forwarded ? { "x-forwarded-for": forwarded } : {}) },
      body: JSON.stringify(scenario.request),
    }),
  );
}
