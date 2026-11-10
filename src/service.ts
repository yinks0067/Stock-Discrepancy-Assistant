/**
 * Service layer shared by the API routes and the web pages.
 * Picks the AI agent when ANTHROPIC_API_KEY is set, otherwise the rule-based baseline.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { handlers, pool } from "./tools";
import { investigate, type Finding } from "./investigate";
import { investigateBaseline } from "./baseline";

export type Discrepancy = {
  sku: string; name: string; category: string; opening: number; received: number; sold: number;
  wasted: number; expected: number; counted: number; units_missing: number; value_missing_gbp: number;
};

export type Investigation = {
  finding: Finding; toolCalls: string[]; engine: "ai" | "baseline"; durationMs: number;
};

const DISCREPANCY_SQL = readFileSync(path.join(process.cwd(), "db/discrepancies.sql"), "utf8");

export async function listDiscrepancies(): Promise<Discrepancy[]> {
  const { rows } = await pool.query(DISCREPANCY_SQL);
  const nums = ["opening", "received", "sold", "wasted", "expected", "counted", "units_missing", "value_missing_gbp"] as const;
  // Postgres returns SUM()/NUMERIC as strings; convert so the API returns real numbers.
  return rows.map((r) => ({ ...r, ...Object.fromEntries(nums.map((k) => [k, Number(r[k])])) }));
}

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.ENGINE !== "baseline";
}

const cache = new Map<string, Investigation>();

export async function investigateSku(sku: string, fresh = false): Promise<Investigation> {
  if (!/^SKU\d{4}$/.test(sku)) throw new Error("Invalid SKU");
  if (!fresh && cache.has(sku)) return cache.get(sku)!;
  const started = Date.now();
  const engine = aiEnabled() ? "ai" : "baseline";
  const { finding, toolCalls } = engine === "ai" ? await investigate(sku) : await investigateBaseline(sku);
  const result: Investigation = { finding, toolCalls, engine, durationMs: Date.now() - started };
  cache.set(sku, result);
  return result;
}

export async function productDetail(sku: string) {
  const product = (await handlers.get_product({ sku })) as Record<string, unknown> & { error?: string };
  if (product.error) return null;
  const [summary, deliveries, weeklySales, wastage, similar] = await Promise.all([
    handlers.get_stock_summary({ sku }),
    handlers.get_deliveries({ sku }),
    handlers.get_weekly_sales({ sku }),
    handlers.get_wastage({ sku }),
    handlers.find_similar_products({ sku }),
  ]);
  return {
    product: product as { sku: string; name: string; category: string; unit_cost: string; unit_price: string; perishable: boolean },
    summary: summary as { opening: number; received: number; sold: number; wasted: number; expected: number; counted: number; units_missing: number; value_missing_gbp: string },
    deliveries: deliveries as { delivery_day: number; supplier_ref: string; qty_invoiced: number; qty_received: number }[],
    weeklySales: weeklySales as { week: number; units: number }[],
    wastage: wastage as { reason: string; units: number; write_offs: number }[],
    similar: similar as { sku: string; name: string; units_missing?: number }[],
  };
}
