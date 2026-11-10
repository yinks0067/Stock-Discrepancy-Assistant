/**
 * Rule-based investigator. Uses the same tool handlers as the AI agent, but
 * applies fixed rules instead of an LLM. Two jobs:
 *   1. Offline/demo mode when no ANTHROPIC_API_KEY is set.
 *   2. A baseline to compare the AI agent against in the eval.
 */
import { handlers, type Cause } from "./tools";
import type { Finding } from "./investigate";

type Summary = { units_missing: number; value_missing_gbp: string; received: number; wasted: number; sold: number };
type Product = { name: string; category: string; perishable: boolean };
type Delivery = { delivery_day: number; supplier_ref: string; qty_invoiced: number; qty_received: number };
type Similar = { sku: string; name: string; units_missing?: number };
type Waste = { reason: string; units: number; write_offs: number };

const gbp = (v: string | number) => `£${Number(v).toFixed(2)}`;

export async function investigateBaseline(sku: string): Promise<{ finding: Finding; toolCalls: string[] }> {
  const toolCalls = ["get_stock_summary", "get_product", "get_deliveries", "find_similar_products", "get_wastage"];
  const s = (await handlers.get_stock_summary({ sku })) as Summary & { error?: string };
  if (s.error) throw new Error(`Unknown product ${sku}`);
  const p = (await handlers.get_product({ sku })) as Product;
  const deliveries = (await handlers.get_deliveries({ sku })) as Delivery[];
  const similar = (await handlers.find_similar_products({ sku })) as Similar[];
  const waste = (await handlers.get_wastage({ sku })) as Waste[];

  const missing = s.units_missing;
  const value = gbp(s.value_missing_gbp);
  const base = `${missing} units of ${p.name} (${value}) are missing compared with what the records say should be on the shelf.`;
  const ev: string[] = [`Expected ${missing} more units than were counted (${value}).`];

  const finish = (cause: Cause, confidence: Finding["confidence"], explanation: string, action: string) => ({
    finding: { sku, cause, confidence, explanation, recommended_action: action, evidence: ev },
    toolCalls,
  });

  // 1. Same delivery note booked in twice
  const seen = new Map<string, Delivery>();
  const dup = deliveries.find((d) => (seen.has(d.supplier_ref) ? true : (seen.set(d.supplier_ref, d), false)));
  if (dup) {
    ev.push(`Delivery note ${dup.supplier_ref} appears twice in the records (${dup.qty_received} units each time).`);
    return finish("double_counted_delivery", dup.qty_received === missing ? "high" : "medium",
      `${base} Delivery note ${dup.supplier_ref} was booked in twice, so the system thinks ${dup.qty_received} more units arrived than really did.`,
      `Remove the duplicate booking of delivery ${dup.supplier_ref} and check who booked it in.`);
  }

  // 2. Look-alike product with the same amount extra
  const twin = similar.find((x) => x.units_missing === -missing);
  if (twin && missing > 0) {
    ev.push(`Look-alike product ${twin.name} (${twin.sku}) has exactly ${missing} units extra.`);
    return finish("scanning_error", "high",
      `${base} The look-alike ${twin.name} has the same number of units extra, so the till is likely scanning one as the other.`,
      `Check the barcodes and shelf labels for ${p.name} and ${twin.name}, and remind till staff to scan each item.`);
  }

  // 3. Missing amount equals one delivery
  const match = deliveries.find((d) => d.qty_received === missing);
  if (match) {
    ev.push(`Delivery ${match.supplier_ref} on day ${match.delivery_day} was for exactly ${missing} units.`);
    return finish("missed_delivery", "medium",
      `${base} That matches delivery ${match.supplier_ref} exactly, which was booked in as received but probably never arrived.`,
      `Ask the supplier for proof of delivery for ${match.supplier_ref} and request a credit if it cannot be shown.`);
  }

  // 4. Perishable with stock going missing
  const wasted = waste.reduce((a, w) => a + w.units, 0);
  if (p.perishable) {
    ev.push(`${p.name} is perishable; only ${wasted} units were written off as waste.`);
    return finish("unrecorded_wastage", "medium",
      `${base} It is a short-life product and very little waste was recorded, so out-of-date stock is likely being thrown away without being written off.`,
      `Remind staff to record every out-of-date ${p.name} in the wastage log before binning it.`);
  }

  // 5. Otherwise: shrinkage
  ev.push("No duplicate deliveries, matching delivery, or look-alike product explains the gap.");
  return finish("shrinkage", "low",
    `${base} No paperwork or till problem explains it, which points to items leaving the store without being paid for.`,
    `Move ${p.name} to a more visible spot or behind the counter and spot-check the count weekly.`);
}
