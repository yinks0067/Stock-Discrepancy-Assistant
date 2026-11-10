# Stock Discrepancy Assistant

An AI assistant for a small grocery store. It finds products where the stock records don't match what's on the shelf, then **investigates each one with an LLM agent using tool use** and explains the likely cause in plain English, with a recommended action for the store manager.

![Discrepancy list](docs/screenshot-list.png)

![Product investigation](docs/screenshot-detail.png)

## What it does

1. **Finds the gaps.** For every product: expected stock = opening count + deliveries booked in − till sales − recorded waste. Anything that doesn't match the closing shelf count is a discrepancy, ranked by £ value.
2. **Investigates each one.** A Claude agent calls tools that run SQL against PostgreSQL (stock summary, deliveries, weekly sales, wastage, look-alike products), and keeps calling them until it has enough evidence.
3. **Explains it for a manager.** The agent must finish with a `report_finding` tool call, so the output is always structured: cause, confidence, a 2–3 sentence explanation, one recommended action, and the evidence it used.

It tells apart five causes: **shrinkage/theft, missed delivery, till scanning error (look-alike products), unrecorded waste, and a delivery note booked in twice.**

## Architecture

```
Next.js (App Router, TypeScript)
├─ /                       discrepancy list (server component)
├─ /product/[sku]          stock maths, deliveries, sales, waste, look-alikes + "Investigate"
├─ GET  /api/discrepancies         all discrepancies, biggest £ first
├─ POST /api/investigate/:sku      run the investigator → structured finding (JSON)
└─ GET  /api/health                DB check, used by Docker / Azure health probes
        │
        ▼
src/service.ts  ── picks the engine ──►  src/investigate.ts   Claude agent loop (tool use)
                                         src/baseline.ts      rule-based investigator (offline mode)
        │                                       │
        └────────────── src/tools.ts ◄──────────┘   tool schemas + parameterised SQL
                              │
                         PostgreSQL 16
```

- **Agent loop** (`src/investigate.ts`): sends the SKU plus the tool definitions to Claude; runs every `tool_use` block against the database and returns the results; stops when the model calls `report_finding` (max 10 turns). The model never sees the whole database, only what it asks for.
- **Offline mode** (`src/baseline.ts`): if `ANTHROPIC_API_KEY` is not set, a rule-based investigator uses the *same* tool handlers. The app is fully usable without a key, and the rules double as a baseline to measure the AI against.
- **Synthetic data** (`scripts/generate-data.ts`): 128 products, 90 days of sales, deliveries and waste, with 20 planted discrepancies (4 per cause). Seeded, so it is the same every run. Ground truth is kept in `eval/ground_truth.json` and is never sent to the model.

## Evaluation

`npm run eval` investigates all 20 planted cases and prints accuracy and a confusion table.

| Engine | Cause accuracy (20 planted cases) |
| --- | --- |
| Rule-based baseline (`npm run eval:baseline`) | **19 / 20 = 95%** |
| Claude agent (`npm run eval`) | run with your API key and record here |

The baseline's one miss is instructive: a theft case where the missing amount happens by chance to equal one delivery's size, so a fixed rule calls it a missed delivery. That is exactly the kind of case an agent that can weigh the wider evidence should get right.

## Run it

### Option A: Docker (one command)

```bash
npm install && npm run generate     # creates data/*.csv
docker compose up --build           # Postgres + loader + app → http://localhost:3000
```

Put `ANTHROPIC_API_KEY=...` in a `.env` file to switch from offline mode to the Claude agent.

### Option B: local Node + PostgreSQL

```bash
npm install
export DATABASE_URL="postgresql://user:pass@localhost:5432/stock"
export ANTHROPIC_API_KEY="..."          # optional; without it the app runs in offline mode

npm run generate                        # synthetic store data + 20 planted discrepancies
npm run db:reset                        # create tables and load the data (needs psql)
npm run dev                             # http://localhost:3000

npm test                                # 9 tests against a real PostgreSQL
npm run investigate -- SKU0063          # one investigation from the command line
npm run eval                            # score the Claude agent on all 20 cases
npm run eval:baseline                   # score the rule-based baseline
```

### API

```bash
curl localhost:3000/api/discrepancies
curl -X POST localhost:3000/api/investigate/SKU0084
```

```json
{
  "finding": {
    "sku": "SKU0084",
    "cause": "double_counted_delivery",
    "confidence": "high",
    "explanation": "7 units of Cornflakes Wholegrain (£10.43) are missing ... Delivery note DN12082 was booked in twice ...",
    "recommended_action": "Remove the duplicate booking of delivery DN12082 and check who booked it in.",
    "evidence": ["Delivery note DN12082 appears twice in the records (7 units each time)."]
  },
  "toolCalls": ["get_stock_summary", "get_product", "get_deliveries", "find_similar_products", "get_wastage"],
  "engine": "baseline",
  "durationMs": 12
}
```

## Testing and CI

- **Vitest**, run against a real PostgreSQL: the discrepancy query finds exactly the planted products, the stock maths matches the ground truth, duplicate delivery notes and look-alike pairs are detectable from the tools, the list is sorted by £, bad SKUs are rejected, and the baseline stays at ≥ 90% accuracy.
- **GitHub Actions** (`.github/workflows/ci.yml`): spins up Postgres, generates and loads the data, type-checks, runs the tests, runs the baseline eval, runs the Claude eval when an `ANTHROPIC_API_KEY` secret is set, builds the app, and builds the Docker image.

## Deploying to Azure Container Apps

```bash
az group create -n stock-rg -l uksouth
az acr create -n <registry> -g stock-rg --sku Basic --admin-enabled true
az acr build -r <registry> -t stock-assistant:latest .

az postgres flexible-server create -g stock-rg -n <pg-server> --tier Burstable --sku-name Standard_B1ms \
  --admin-user app --admin-password '<password>' --public-access 0.0.0.0
# load the data once:  psql "<azure connection string>" -f db/schema.sql -f db/load.sql

az containerapp up -n stock-assistant -g stock-rg --image <registry>.azurecr.io/stock-assistant:latest \
  --target-port 3000 --ingress external \
  --env-vars DATABASE_URL='<azure connection string>?sslmode=require' ANTHROPIC_API_KEY='<key>'
```

## Tech

TypeScript · Next.js 16 (App Router) · React 19 · PostgreSQL 16 · Anthropic Claude API (tool use) · Vitest · Docker · GitHub Actions · Azure Container Apps

## Project layout

| Path | What it is |
| --- | --- |
| `app/` | Next.js pages and API routes |
| `src/tools.ts` | Tool definitions for Claude + the SQL behind each tool |
| `src/investigate.ts` | Agent loop: Claude calls tools until it reports a structured finding |
| `src/baseline.ts` | Rule-based investigator (offline mode and eval baseline) |
| `src/service.ts` | Shared service layer used by pages and API routes |
| `db/` | Schema, CSV loader, discrepancy query |
| `scripts/generate-data.ts` | Seeded synthetic store data with planted discrepancies |
| `eval/run-eval.ts` | Accuracy and confusion table across the 20 cases |
| `tests/` | Vitest suites |
| `Dockerfile`, `docker-compose.yml` | Production image and one-command local demo |
