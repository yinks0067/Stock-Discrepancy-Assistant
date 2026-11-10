# Stock Discrepancy Assistant — project brief for Claude Code

## What we're building
A small grocery store has stock records that don't match what's on the shelf.
This app finds the products where **expected stock** and **counted stock** disagree,
then uses an LLM with **tool use** to investigate each one and explain the likely
cause in plain English, with a recommended action.

Audience: a store manager, not a technical user. Every explanation must be short,
plain and actionable.

## Stack (keep to this)
- TypeScript, Node.js 20+ (Bun is fine too)
- PostgreSQL (local first, Azure Database for PostgreSQL later)
- Anthropic Claude API with tool use (`@anthropic-ai/sdk`)
- Next.js front end (screens designed in Figma first)
- Vitest for tests, GitHub Actions for CI, Docker for deployment to Azure Container Apps

## Data model (see `db/schema.sql`)
- `products` — SKU, name, category, unit cost, shelf-life flag
- `stock_counts` — physical counts (opening count on day 0, closing count on day 90)
- `deliveries` — what the supplier says was delivered, and what was actually received
- `sales` — till sales per product per day
- `wastage` — recorded write-offs (out-of-date, damaged)

**Expected stock** = opening count + received deliveries − sales − recorded wastage.
A **discrepancy** = expected stock − closing count (positive = stock missing).

## The 5 planted causes (the AI must tell these apart)
| Cause label | What it looks like in the data |
| --- | --- |
| `shrinkage` | Stock missing, no delivery or till anomaly; often high-value, small items |
| `missed_delivery` | A delivery was booked in as received in full but never physically arrived. Missing amount = exactly one delivery's quantity; no duplicate references |
| `scanning_error` | Two look-alike products: one shows stock missing, its sibling shows the same amount *extra*. The till scanned the wrong item |
| `unrecorded_wastage` | Short-shelf-life product (`perishable = true`), stock missing, little or no recorded wastage |
| `double_counted_delivery` | The same delivery-note reference appears twice in `deliveries`. Missing amount = that delivery's quantity |

Ground truth is in `eval/ground_truth.json` (generated — never show it to the model).

## Build steps
1. `npm install`, create the database, run `db/schema.sql`, run `npm run generate` then `npm run load`.
2. Implement `GET /api/discrepancies` using `db/discrepancies.sql`.
3. Implement the tool handlers in `src/tools.ts` (queries against PostgreSQL).
4. Implement `POST /api/investigate/:sku`: call Claude with the tools in a loop until it returns the final `report_finding` tool call. Return that JSON.
5. Next.js UI: discrepancy list (sorted by £ value missing) → product detail with the AI explanation and recommended action.
6. Tests (Vitest): expected-stock maths, discrepancy query, each tool handler.
7. `npm run eval` — investigate all 20 planted products and score cause accuracy.
8. Dockerfile + GitHub Actions + deploy to Azure Container Apps.

## Rules
- The model must call tools to get facts. Never put the whole database in the prompt.
- The model must finish with the `report_finding` tool so output is structured.
- Money in GBP, two decimal places. Plain English, no jargon in explanations.
- Keep secrets in environment variables (`DATABASE_URL`, `ANTHROPIC_API_KEY`).
