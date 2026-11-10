import { NextResponse } from "next/server";
import { pool } from "@/src/tools";
import { aiEnabled } from "@/src/service";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness check used by Docker and Azure Container Apps. */
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, engine: aiEnabled() ? "ai" : "baseline" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
