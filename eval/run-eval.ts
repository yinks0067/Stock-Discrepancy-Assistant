/**
 * Score the assistant on the 20 planted discrepancies.
 * Prints per-case results, overall cause accuracy, and a confusion table.
 * The ground truth is read here only; it is never sent to the model.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { investigate } from "../src/investigate";
import { investigateBaseline } from "../src/baseline";

// npm run eval            -> AI agent (needs ANTHROPIC_API_KEY)
// npm run eval:baseline   -> rule-based baseline (no API key needed)
const useBaseline = process.argv.includes("--baseline");
const run = useBaseline ? investigateBaseline : investigate;
const engine = useBaseline ? "baseline" : "ai";
import { pool, CAUSES } from "../src/tools";

type Truth = { sku: string; name: string; cause: string; evaluated: boolean };
const truth = (JSON.parse(readFileSync("eval/ground_truth.json", "utf8")) as Truth[]).filter((t) => t.evaluated);

const rows: { sku: string; name: string; expected: string; predicted: string; confidence: string; ok: boolean }[] = [];
for (const t of truth) {
  try {
    const { finding } = await run(t.sku);
    rows.push({ sku: t.sku, name: t.name, expected: t.cause, predicted: finding.cause, confidence: finding.confidence, ok: finding.cause === t.cause });
  } catch (e) {
    console.error(`  ${t.sku}: ${(e as Error).message}`);
    rows.push({ sku: t.sku, name: t.name, expected: t.cause, predicted: "error", confidence: "-", ok: false });
  }
  const r = rows.at(-1)!;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.sku}  ${r.name.padEnd(30)} expected=${r.expected.padEnd(24)} got=${r.predicted} (${r.confidence})`);
}

const correct = rows.filter((r) => r.ok).length;
console.log(`\n[${engine}] Cause accuracy: ${correct}/${rows.length} = ${((100 * correct) / rows.length).toFixed(0)}%\n`);

console.log("Confusion (rows = actual, cols = predicted):");
const labels = [...CAUSES, "error"];
console.log("".padEnd(26) + labels.map((l) => l.slice(0, 10).padEnd(11)).join(""));
for (const a of CAUSES) {
  console.log(a.padEnd(26) + labels.map((p) => String(rows.filter((r) => r.expected === a && r.predicted === p).length).padEnd(11)).join(""));
}

writeFileSync(`eval/results-${engine}.json`, JSON.stringify(rows, null, 2) + "\n");
await pool.end();
