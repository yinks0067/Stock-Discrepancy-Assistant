/**
 * Tools the model can call to investigate a stock discrepancy.
 * Each tool = a JSON-schema definition (sent to Claude) + a handler (runs SQL).
 */
import type Anthropic from "@anthropic-ai/sdk";
import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

export const CAUSES = [
  "shrinkage",
  "missed_delivery",
  "scanning_error",
  "unrecorded_wastage",
  "double_counted_delivery",
] as const;
export type Cause = (typeof CAUSES)[number];

export const tools: Anthropic.Tool[] = [
  {
    name: "get_stock_summary",
    description:
      "Expected vs counted stock for one product over the 90-day period: opening count, units received, sold, wasted, expected closing, counted closing, and units/£ missing (negative = extra stock).",
    input_schema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
  },
  {
    name: "get_product",
    description: "Product details: name, category, cost, price and whether it is perishable.",
    input_schema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
  },
  {
    name: "get_deliveries",
    description:
      "Every delivery booked in for a product: day, supplier delivery-note reference, quantity invoiced and quantity received. Look for duplicate references.",
    input_schema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
  },
  {
    name: "get_weekly_sales",
    description: "Units sold per week (13 weeks) for a product, from till records.",
    input_schema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
  },
  {
    name: "get_wastage",
    description: "Recorded write-offs for a product: total units and number of write-offs, by reason.",
    input_schema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
  },
  {
    name: "find_similar_products",
    description:
      "Products in the same category with a similar name (e.g. a size or flavour variant), with each one's stock discrepancy. Useful for spotting till scanning errors, where one product is missing stock and a look-alike has the same amount extra.",
    input_schema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
  },
  {
    name: "report_finding",
    description:
      "Call this once, last, to give your conclusion. Write for a store manager: short, plain English, no jargon.",
    input_schema: {
      type: "object",
      properties: {
        sku: { type: "string" },
        cause: { type: "string", enum: [...CAUSES] },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        explanation: { type: "string", description: "2-3 sentences: what happened and the evidence for it." },
        recommended_action: { type: "string", description: "One concrete next step for the store manager." },
        evidence: { type: "array", items: { type: "string" }, description: "The specific facts from the tools that support the cause." },
      },
      required: ["sku", "cause", "confidence", "explanation", "recommended_action", "evidence"],
    },
  },
];

const SUMMARY_SQL = `
WITH o AS (SELECT qty_counted v FROM stock_counts WHERE sku=$1 AND count_day=0),
     c AS (SELECT qty_counted v FROM stock_counts WHERE sku=$1 AND count_day=90),
     r AS (SELECT COALESCE(SUM(qty_received),0) v FROM deliveries WHERE sku=$1),
     s AS (SELECT COALESCE(SUM(qty_sold),0) v FROM sales WHERE sku=$1),
     w AS (SELECT COALESCE(SUM(qty_wasted),0) v FROM wastage WHERE sku=$1)
SELECT o.v opening, r.v::int received, s.v::int sold, w.v::int wasted,
       (o.v + r.v - s.v - w.v)::int expected, c.v counted,
       (o.v + r.v - s.v - w.v - c.v)::int units_missing,
       ROUND((o.v + r.v - s.v - w.v - c.v) * (SELECT unit_cost FROM products WHERE sku=$1), 2) value_missing_gbp
FROM o, c, r, s, w`;

export const handlers: Record<string, (input: { sku: string }) => Promise<unknown>> = {
  get_stock_summary: async ({ sku }) => (await q(SUMMARY_SQL, [sku]))[0] ?? { error: "unknown sku" },
  get_product: async ({ sku }) => (await q("SELECT * FROM products WHERE sku=$1", [sku]))[0] ?? { error: "unknown sku" },
  get_deliveries: async ({ sku }) =>
    q("SELECT delivery_day, supplier_ref, qty_invoiced, qty_received FROM deliveries WHERE sku=$1 ORDER BY delivery_day", [sku]),
  get_weekly_sales: async ({ sku }) =>
    q("SELECT (sale_day-1)/7 + 1 AS week, SUM(qty_sold)::int AS units FROM sales WHERE sku=$1 GROUP BY 1 ORDER BY 1", [sku]),
  get_wastage: async ({ sku }) =>
    q("SELECT reason, SUM(qty_wasted)::int AS units, COUNT(*)::int AS write_offs FROM wastage WHERE sku=$1 GROUP BY reason", [sku]),
  find_similar_products: async ({ sku }) => {
    const [p] = await q("SELECT name, category FROM products WHERE sku=$1", [sku]);
    if (!p) return { error: "unknown sku" };
    const stem = p.name.split(" ").slice(0, 2).join(" ");
    const sims = await q(
      "SELECT sku, name FROM products WHERE category=$1 AND sku<>$2 AND name ILIKE $3",
      [p.category, sku, `${stem}%`],
    );
    return Promise.all(sims.map(async (s) => ({ ...s, ...((await q(SUMMARY_SQL, [s.sku]))[0] ?? {}) })));
  },
};
