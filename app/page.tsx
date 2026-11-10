import Link from "next/link";
import { listDiscrepancies } from "@/src/service";

export const dynamic = "force-dynamic";

const gbp = (n: number) => `£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function Home() {
  const rows = await listDiscrepancies();
  const missing = rows.filter((r) => r.units_missing > 0);
  const extra = rows.filter((r) => r.units_missing < 0);
  const lost = missing.reduce((a, r) => a + r.value_missing_gbp, 0);

  return (
    <main>
      <h1>Stock that doesn&apos;t match the shelf</h1>
      <p className="sub">Last 90 days. Expected stock = opening count + deliveries − till sales − recorded waste. Pick a product to see why it&apos;s out.</p>

      <section className="stats">
        <div className="stat"><div className="k">Products out</div><div className="v">{rows.length}</div></div>
        <div className="stat"><div className="k">Stock missing</div><div className="v loss">{gbp(lost)}</div></div>
        <div className="stat"><div className="k">Products short</div><div className="v">{missing.length}</div></div>
        <div className="stat"><div className="k">Products over</div><div className="v">{extra.length}</div></div>
      </section>

      <section className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th className="hide-sm">Category</th>
              <th className="num hide-sm">Expected</th>
              <th className="num hide-sm">Counted</th>
              <th className="num">Units</th>
              <th className="num">Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku} className="row">
                <td>
                  <Link href={`/product/${r.sku}`}>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="sku">{r.sku}</div>
                  </Link>
                </td>
                <td className="hide-sm muted">{r.category}</td>
                <td className="num hide-sm">{r.expected}</td>
                <td className="num hide-sm">{r.counted}</td>
                <td className={`num ${r.units_missing > 0 ? "loss" : "gain"}`}>
                  {r.units_missing > 0 ? `−${r.units_missing}` : `+${-r.units_missing}`}
                </td>
                <td className={`num ${r.units_missing > 0 ? "loss" : "gain"}`}>
                  {r.units_missing > 0 ? "−" : "+"}{gbp(r.value_missing_gbp)}
                </td>
                <td className="num"><Link href={`/product/${r.sku}`} className="muted"><span className="hide-sm">Investigate </span>→</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
