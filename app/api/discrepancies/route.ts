import { NextResponse } from "next/server";
import { listDiscrepancies } from "@/src/service";

export const dynamic = "force-dynamic";

/** GET /api/discrepancies — every product whose counted stock differs from expected, biggest £ first. */
export async function GET() {
  try {
    const rows = await listDiscrepancies();
    const missing = rows.filter((r) => r.value_missing_gbp > 0).reduce((a, r) => a + r.value_missing_gbp, 0);
    return NextResponse.json({ count: rows.length, total_value_missing_gbp: Number(missing.toFixed(2)), discrepancies: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
