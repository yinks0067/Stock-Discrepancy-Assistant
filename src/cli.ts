// Usage: npm run investigate -- SKU0012
import { investigate } from "./investigate";
import { pool } from "./tools";

const sku = process.argv[2];
if (!sku) { console.error("Usage: npm run investigate -- <SKU>"); process.exit(1); }
const { finding, toolCalls } = await investigate(sku);
console.log(`Tools used: ${toolCalls.join(", ")}\n`);
console.log(JSON.stringify(finding, null, 2));
await pool.end();
