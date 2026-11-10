/**
 * Checks the stock maths against the generated ground truth.
 * Needs DATABASE_URL pointing at a loaded database (npm run generate && npm run db:reset).
 */
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { handlers, pool } from "../src/tools";

const hasDb = Boolean(process.env.DATABASE_URL);
const truth = JSON.parse(readFileSync("eval/ground_truth.json", "utf8")) as { sku: string; units_missing: number; cause: string }[];

describe.skipIf(!hasDb)("stock discrepancies", () => {
  afterAll(() => pool.end());

  it("finds exactly the planted discrepancies", async () => {
    const rows = (await pool.query(readFileSync("db/discrepancies.sql", "utf8"))).rows;
    expect(rows.map((r) => r.sku).sort()).toEqual(truth.map((t) => t.sku).sort());
  });

  it("computes the same units missing as the ground truth", async () => {
    for (const t of truth) {
      const s = (await handlers.get_stock_summary({ sku: t.sku })) as { units_missing: number };
      expect(s.units_missing, t.sku).toBe(t.units_missing);
    }
  });

  it("shows a duplicated delivery note for double-counted deliveries", async () => {
    for (const t of truth.filter((t) => t.cause === "double_counted_delivery")) {
      const d = (await handlers.get_deliveries({ sku: t.sku })) as { supplier_ref: string }[];
      const refs = d.map((x) => x.supplier_ref);
      expect(new Set(refs).size, t.sku).toBe(refs.length - 1);
    }
  });

  it("pairs each scanning error with a look-alike that has the same amount extra", async () => {
    for (const t of truth.filter((t) => t.cause === "scanning_error" && t.units_missing > 0)) {
      const sims = (await handlers.find_similar_products({ sku: t.sku })) as { units_missing: number }[];
      expect(sims.some((s) => s.units_missing === -t.units_missing), t.sku).toBe(true);
    }
  });
});
