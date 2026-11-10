/**
 * Service layer + rule-based investigator, checked against the ground truth.
 * Needs DATABASE_URL pointing at a loaded database.
 */
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/tools";
import { listDiscrepancies, investigateSku, productDetail } from "../src/service";
import { investigateBaseline } from "../src/baseline";

const hasDb = Boolean(process.env.DATABASE_URL);
const truth = (JSON.parse(readFileSync("eval/ground_truth.json", "utf8")) as { sku: string; cause: string; evaluated: boolean }[]).filter((t) => t.evaluated);

describe.skipIf(!hasDb)("service layer", () => {
  afterAll(() => pool.end());

  it("lists discrepancies sorted by £ value, largest first", async () => {
    const rows = await listDiscrepancies();
    const abs = rows.map((r) => Math.abs(r.value_missing_gbp));
    expect(abs).toEqual([...abs].sort((a, b) => b - a));
    expect(typeof rows[0].value_missing_gbp).toBe("number");
    expect(typeof rows[0].units_missing).toBe("number");
  });

  it("returns product detail, and null for an unknown SKU", async () => {
    const d = await productDetail(truth[0].sku);
    expect(d?.product.sku).toBe(truth[0].sku);
    expect(d?.weeklySales.length).toBe(13);
    expect(await productDetail("SKU9999")).toBeNull();
  });

  it("rejects malformed SKUs", async () => {
    await expect(investigateSku("DROP TABLE")).rejects.toThrow("Invalid SKU");
  });

  it("baseline returns a complete, well-formed finding", async () => {
    const { finding } = await investigateBaseline(truth[0].sku);
    expect(finding.sku).toBe(truth[0].sku);
    expect(finding.explanation.length).toBeGreaterThan(20);
    expect(finding.recommended_action.length).toBeGreaterThan(10);
    expect(finding.evidence.length).toBeGreaterThan(0);
  });

  it("baseline gets at least 90% of planted causes right", async () => {
    let ok = 0;
    for (const t of truth) if ((await investigateBaseline(t.sku)).finding.cause === t.cause) ok++;
    expect(ok / truth.length).toBeGreaterThanOrEqual(0.9);
  });
});
