import Link from "next/link";
import { notFound } from "next/navigation";
import { productDetail } from "@/src/service";
import InvestigatePanel from "./InvestigatePanel";

export const dynamic = "force-dynamic";

const gbp = (v: string | number) => `£${Math.abs(Number(v)).toFixed(2)}`;

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const d = await productDetail(sku.toUpperCase());
  if (!d) notFound();
  const { product: p, summary: s, deliveries, weeklySales, wastage, similar } = d;
  const maxWeek = Math.max(1, ...weeklySales.map((w) => w.units));
  const refCounts = deliveries.reduce<Record<string, number>>((a, x) => ((a[x.supplier_ref] = (a[x.supplier_ref] ?? 0) + 1), a), {});
  const short = s.units_missing > 0;

  return (
    <main>
      <Link href="/" className="back">← All discrepancies</Link>
      <h1>{p.name}</h1>
      <p className="sub">
        <span className="sku">{p.sku}</span> · {p.category} · cost {gbp(p.unit_cost)} · {p.perishable ? "short shelf life" : "long shelf life"}
      </p>

      <div className="grid2">
        <div className="stack">
          <InvestigatePanel sku={p.sku} />

          <section className="card">
            <h2>Deliveries booked in ({deliveries.length})</h2>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              <table>
                <thead><tr><th>Day</th><th>Delivery note</th><th className="num">Invoiced</th><th className="num">Booked in</th></tr></thead>
                <tbody>
                  {deliveries.map((x, i) => (
                    <tr key={i} className={refCounts[x.supplier_ref] > 1 ? "dup" : ""}>
                      <td>{x.delivery_day}</td>
                      <td className="sku">{x.supplier_ref}{refCounts[x.supplier_ref] > 1 ? " · duplicate" : ""}</td>
                      <td className="num">{x.qty_invoiced}</td>
                      <td className="num">{x.qty_received}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2>How the gap is worked out</h2>
            <div className="calc">
              <span>Opening count (day 0)</span><span className="num">{s.opening}</span>
              <span>+ Deliveries booked in</span><span className="num">{s.received}</span>
              <span>− Till sales</span><span className="num">{s.sold}</span>
              <span>− Recorded waste</span><span className="num">{s.wasted}</span>
              <span className="total">Expected on shelf</span><span className="num total">{s.expected}</span>
              <span>Counted on shelf (day 90)</span><span className="num">{s.counted}</span>
              <span className="total">{short ? "Missing" : "Extra"}</span>
              <span className={`num total ${short ? "loss" : "gain"}`}>{Math.abs(s.units_missing)} units · {gbp(s.value_missing_gbp)}</span>
            </div>
          </section>

          <section className="card">
            <h2>Weekly till sales</h2>
            <div className="bars" aria-label="Units sold per week">
              {weeklySales.map((w) => <div key={w.week} title={`Week ${w.week}: ${w.units}`} style={{ height: `${(w.units / maxWeek) * 100}%` }} />)}
            </div>
            <div className="meta">13 weeks · {s.sold} units in total</div>
          </section>

          <section className="card">
            <h2>Recorded waste</h2>
            {wastage.length === 0 ? <p className="muted" style={{ margin: 0 }}>None recorded.</p> :
              wastage.map((w) => <div key={w.reason} className="calc"><span>{w.reason.replace(/_/g, " ")} ({w.write_offs} write-offs)</span><span className="num">{w.units}</span></div>)}
          </section>

          {similar.length > 0 && (
            <section className="card">
              <h2>Look-alike products</h2>
              {similar.map((x) => (
                <div key={x.sku} className="calc">
                  <Link href={`/product/${x.sku}`}>{x.name}</Link>
                  <span className={`num ${(x.units_missing ?? 0) > 0 ? "loss" : (x.units_missing ?? 0) < 0 ? "gain" : "muted"}`}>
                    {(x.units_missing ?? 0) === 0 ? "matches" : (x.units_missing ?? 0) > 0 ? `−${x.units_missing}` : `+${-(x.units_missing ?? 0)}`}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
