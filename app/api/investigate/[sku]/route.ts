import { NextResponse } from "next/server";
import { investigateSku } from "@/src/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/investigate/:sku — run the investigator and return its structured finding. ?fresh=1 skips the cache. */
export async function POST(req: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  try {
    return NextResponse.json(await investigateSku(sku.toUpperCase(), fresh));
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === "Invalid SKU" || msg.startsWith("Unknown product") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
