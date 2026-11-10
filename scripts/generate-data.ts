/**
 * Synthetic data for one small grocery store over 90 days, with 20 planted
 * stock discrepancies (4 for each of 5 causes).
 *
 * Output (in ./data): products.csv, stock_counts.csv, deliveries.csv, sales.csv,
 * wastage.csv, plus eval/ground_truth.json (the answers; never show the model).
 *
 * Run: npm run generate   (deterministic: same seed, same data)
 */
import { mkdirSync, writeFileSync } from "node:fs";

const SEED = Number(process.env.SEED ?? 42);
const DAYS = 90;
const CASES_PER_CAUSE = 4;

// ---------- deterministic random ----------
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
function poisson(lambda: number) {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}
function shuffle<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- catalogue ----------
type Product = { sku: string; name: string; category: string; unit_cost: number; unit_price: number; perishable: boolean; rate: number; pair?: string };

const catalogue: { category: string; perishable: boolean; cost: [number, number]; items: string[]; variants: string[] }[] = [
  { category: "Bakery", perishable: true, cost: [0.4, 1.6], items: ["White Loaf", "Wholemeal Loaf", "Croissants", "Bagels", "Crumpets", "Pitta Bread", "Brioche Rolls", "Tortilla Wraps"], variants: ["", " Large"] },
  { category: "Dairy", perishable: true, cost: [0.5, 2.8], items: ["Semi-Skimmed Milk 2L", "Whole Milk 2L", "Greek Yoghurt", "Cheddar 400g", "Butter 250g", "Double Cream", "Mozzarella", "Free Range Eggs"], variants: ["", " Organic"] },
  { category: "Fruit & Veg", perishable: true, cost: [0.3, 1.9], items: ["Bananas", "Apples", "Strawberries", "Salad Bag", "Tomatoes", "Avocados", "Carrots", "Broccoli"], variants: ["", " Value"] },
  { category: "Meat & Fish", perishable: true, cost: [2.0, 6.5], items: ["Chicken Breast", "Beef Mince", "Salmon Fillets", "Pork Sausages", "Bacon Rashers", "Cod Fillets"], variants: ["", " Large Pack"] },
  { category: "Tins & Jars", perishable: false, cost: [0.3, 1.4], items: ["Baked Beans 415g", "Chopped Tomatoes", "Tuna Chunks", "Chickpeas", "Sweetcorn", "Pasta Sauce", "Coconut Milk", "Kidney Beans"], variants: ["", " Value"] },
  { category: "Dry Goods", perishable: false, cost: [0.5, 2.2], items: ["Penne Pasta 500g", "Basmati Rice 1kg", "Porridge Oats", "Cornflakes", "Plain Flour", "Granulated Sugar", "Instant Coffee", "Tea Bags 80"], variants: ["", " Wholegrain"] },
  { category: "Drinks", perishable: false, cost: [0.6, 3.0], items: ["Orange Juice 1L", "Cola 2L", "Sparkling Water 6pk", "Apple Juice 1L", "Energy Drink 4pk", "Lemonade 2L"], variants: ["", " Zero"] },
  { category: "Health & Beauty", perishable: false, cost: [1.5, 8.0], items: ["Razor Blades 4pk", "Electric Toothbrush Heads", "Face Moisturiser", "Vitamin C Tablets", "Deodorant", "Shampoo 400ml"], variants: ["", " Sensitive"] },
  { category: "Beer, Wine & Spirits", perishable: false, cost: [4.0, 14.0], items: ["Vodka 70cl", "Gin 70cl", "Red Wine", "Prosecco", "Lager 4pk", "Whisky 70cl"], variants: ["", " Premium"] },
];

const products: Product[] = [];
let n = 1;
for (const c of catalogue) {
  for (const item of c.items) {
    const base = +(c.cost[0] + rand() * (c.cost[1] - c.cost[0])).toFixed(2);
    const skus: string[] = [];
    for (const v of c.variants) {
      const sku = `SKU${String(n++).padStart(4, "0")}`;
      skus.push(sku);
      const cost = v ? +(base * (1 + rand() * 0.15)).toFixed(2) : base;
      products.push({
        sku, name: item + v, category: c.category, unit_cost: cost,
        unit_price: +(cost * (1.3 + rand() * 0.3)).toFixed(2),
        perishable: c.perishable, rate: +(1 + rand() * (c.perishable ? 9 : 5)).toFixed(2),
      });
    }
    // variants of the same item are "siblings" (easy to mis-scan at the till)
    const [a, b] = skus.map((s) => products.find((p) => p.sku === s)!);
    a.pair = b.sku; b.pair = a.sku;
  }
}

// ---------- choose planted cases ----------
type Cause = "shrinkage" | "missed_delivery" | "scanning_error" | "unrecorded_wastage" | "double_counted_delivery";
const plan = new Map<string, { cause: Cause; role?: "missing" | "extra"; sibling?: string }>();
const free = (p: Product) => !plan.has(p.sku) && !(p.pair && plan.has(p.pair));

const takeN = (pool: Product[], k: number) => shuffle(pool.filter(free)).slice(0, k);

for (const p of takeN(products.filter((p) => ["Health & Beauty", "Beer, Wine & Spirits"].includes(p.category)), CASES_PER_CAUSE))
  plan.set(p.sku, { cause: "shrinkage" });
for (const p of takeN(products.filter((p) => p.perishable), CASES_PER_CAUSE))
  plan.set(p.sku, { cause: "unrecorded_wastage" });
for (const p of takeN(products.filter((p) => !p.perishable), CASES_PER_CAUSE))
  plan.set(p.sku, { cause: "missed_delivery" });
for (const p of takeN(products.filter((p) => !p.perishable), CASES_PER_CAUSE))
  plan.set(p.sku, { cause: "double_counted_delivery" });
for (const p of takeN(products.filter((p) => !p.perishable && p.pair), CASES_PER_CAUSE)) {
  plan.set(p.sku, { cause: "scanning_error", role: "missing", sibling: p.pair });
  plan.set(p.pair!, { cause: "scanning_error", role: "extra", sibling: p.sku });
}

// ---------- simulate ----------
const counts: string[] = ["sku,count_day,qty_counted"];
const deliveries: string[] = ["sku,delivery_day,supplier_ref,qty_invoiced,qty_received"];
const salesRows: string[] = ["sku,sale_day,qty_sold"];
const wastageRows: string[] = ["sku,waste_day,qty_wasted,reason"];
const truth: Record<string, unknown>[] = [];

const recordedSales = new Map<string, number[]>(); // sku -> per-day recorded sales
let refNo = 10000;

// first pass: true stock + true sales per product
type Sim = { trueSales: number[]; closingTrue: number; opening: number; deliveries: { day: number; qty: number; ref: string; duplicate?: boolean; neverArrived?: boolean }[]; wastage: { day: number; qty: number; reason: string }[]; hiddenLoss: number };
const sims = new Map<string, Sim>();

for (const p of products) {
  const cause = plan.get(p.sku)?.cause;
  const par = Math.ceil(p.rate * (p.perishable ? 4 : 10));
  let stock = randInt(Math.floor(par * 0.5), par);
  const opening = stock;
  const trueSales = new Array(DAYS + 1).fill(0);
  const dels: Sim["deliveries"] = [];
  const wst: Sim["wastage"] = [];
  let hiddenLoss = 0;
  const every = p.perishable ? 3 : 7;
  const missedDay = cause === "missed_delivery" ? every * randInt(3, 9) : -1;
  const dupDay = cause === "double_counted_delivery" ? every * randInt(3, 9) : -1;

  for (let d = 1; d <= DAYS; d++) {
    if (d % every === 0) {
      const qty = Math.max(par - stock, Math.ceil(par * 0.3));
      const ref = `DN${refNo++}`;
      const neverArrived = d === missedDay;
      dels.push({ day: d, qty, ref, neverArrived });
      if (!neverArrived) stock += qty;
      if (d === dupDay) dels.push({ day: d, qty, ref, duplicate: true }); // booked twice, arrived once
    }
    const demand = poisson(p.rate);
    const sold = Math.min(demand, stock);
    trueSales[d] = sold; stock -= sold;

    if (p.perishable && stock > 0) {
      // normal, recorded wastage
      if (cause !== "unrecorded_wastage" && rand() < 0.12) {
        const q = Math.min(stock, randInt(1, 3)); stock -= q; wst.push({ day: d, qty: q, reason: "out_of_date" });
      }
      // hidden wastage: thrown away but never written off
      if (cause === "unrecorded_wastage" && rand() < 0.3) {
        const q = Math.min(stock, randInt(1, 3)); stock -= q; hiddenLoss += q;
      }
    }
    if (!p.perishable && rand() < 0.02 && stock > 0) { stock -= 1; wst.push({ day: d, qty: 1, reason: "damaged" }); }
    if (cause === "shrinkage" && rand() < 0.15 && stock > 0) { stock -= 1; hiddenLoss += 1; } // theft
  }
  sims.set(p.sku, { trueSales, closingTrue: stock, opening, deliveries: dels, wastage: wst, hiddenLoss });
  recordedSales.set(p.sku, [...trueSales]);
}

// scanning errors: some of A's real sales were scanned through the till as B
for (const [sku, info] of plan) {
  if (info.cause !== "scanning_error" || info.role !== "missing") continue;
  const a = recordedSales.get(sku)!, b = recordedSales.get(info.sibling!)!;
  let moved = 0;
  for (let d = 1; d <= DAYS; d++) {
    if (a[d] > 0 && rand() < 0.12) { const m = 1; a[d] -= m; b[d] += m; moved += m; }
  }
  sims.get(sku)!.hiddenLoss = moved;
  sims.get(info.sibling!)!.hiddenLoss = -moved;
}

// ---------- write rows ----------
for (const p of products) {
  const s = sims.get(p.sku)!;
  counts.push(`${p.sku},0,${s.opening}`, `${p.sku},90,${s.closingTrue}`);
  for (const d of s.deliveries) deliveries.push(`${p.sku},${d.day},${d.ref},${d.qty},${d.qty}`);
  recordedSales.get(p.sku)!.forEach((q, d) => { if (d > 0 && q > 0) salesRows.push(`${p.sku},${d},${q}`); });
  for (const w of s.wastage) wastageRows.push(`${p.sku},${w.day},${w.qty},${w.reason}`);

  const info = plan.get(p.sku);
  if (info) {
    const received = s.deliveries.reduce((t, d) => t + d.qty, 0);
    const sold = recordedSales.get(p.sku)!.reduce((t, q) => t + q, 0);
    const wasted = s.wastage.reduce((t, w) => t + w.qty, 0);
    const expected = s.opening + received - sold - wasted;
    truth.push({
      sku: p.sku, name: p.name, cause: info.cause, role: info.role ?? "missing", sibling: info.sibling ?? null,
      units_missing: expected - s.closingTrue,
      evaluated: info.role !== "extra", // the 20 cases scored by eval
      note: info.cause === "missed_delivery" ? `Delivery ${s.deliveries.find((d) => d.neverArrived)?.ref} booked in but never arrived`
        : info.cause === "double_counted_delivery" ? `Delivery ${s.deliveries.find((d) => d.duplicate)?.ref} booked in twice`
        : null,
    });
  }
}

const productRows = ["sku,name,category,unit_cost,unit_price,perishable",
  ...products.map((p) => `${p.sku},"${p.name}",${p.category === "Beer, Wine & Spirits" ? `"${p.category}"` : p.category},${p.unit_cost.toFixed(2)},${p.unit_price.toFixed(2)},${p.perishable}`)];

mkdirSync("data", { recursive: true });
mkdirSync("eval", { recursive: true });
writeFileSync("data/products.csv", productRows.join("\n") + "\n");
writeFileSync("data/stock_counts.csv", counts.join("\n") + "\n");
writeFileSync("data/deliveries.csv", deliveries.join("\n") + "\n");
writeFileSync("data/sales.csv", salesRows.join("\n") + "\n");
writeFileSync("data/wastage.csv", wastageRows.join("\n") + "\n");
writeFileSync("eval/ground_truth.json", JSON.stringify(truth, null, 2) + "\n");

const scored = truth.filter((t) => t.evaluated).length;
console.log(`products: ${products.length}, sales rows: ${salesRows.length - 1}, deliveries: ${deliveries.length - 1}, wastage: ${wastageRows.length - 1}`);
console.log(`planted discrepancies: ${truth.length} (scored cases: ${scored})`);
