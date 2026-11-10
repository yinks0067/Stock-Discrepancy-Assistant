"use client";

import { useState } from "react";

type Result = {
  finding: { cause: string; confidence: string; explanation: string; recommended_action: string; evidence: string[] };
  toolCalls: string[]; engine: "ai" | "baseline"; durationMs: number;
};

const LABELS: Record<string, string> = {
  shrinkage: "Shrinkage / theft",
  missed_delivery: "Missed delivery",
  scanning_error: "Till scanning error",
  unrecorded_wastage: "Unrecorded waste",
  double_counted_delivery: "Delivery booked twice",
};

export default function InvestigatePanel({ sku }: { sku: string }) {
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(fresh = false) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/investigate/${sku}${fresh ? "?fresh=1" : ""}`, { method: "POST" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Investigation failed");
      setRes(body);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!res) {
    return (
      <section className="card finding">
        <h2>Why is this out?</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          The assistant checks deliveries, till sales, waste and look-alike products, then explains the most likely cause.
        </p>
        <button className="btn" onClick={() => run()} disabled={busy}>{busy ? "Investigating…" : "Investigate"}</button>
        {err && <p className="err">{err}</p>}
      </section>
    );
  }

  const f = res.finding;
  return (
    <section className="card finding">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <span className={`cause c-${f.cause}`}>{LABELS[f.cause] ?? f.cause}</span>
        <span className="muted" style={{ fontSize: 13 }}>{f.confidence} confidence</span>
      </div>
      <p style={{ margin: 0, lineHeight: 1.55 }}>{f.explanation}</p>
      <div className="action"><b>What to do</b>{f.recommended_action}</div>
      <h2 style={{ fontSize: 14, marginBottom: 0 }}>Evidence</h2>
      <ul className="ev">{f.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
      <div className="meta">
        {res.engine === "ai" ? "Claude" : "Rule-based"} · {res.toolCalls.length} tool calls ({[...new Set(res.toolCalls)].join(", ")}) · {(res.durationMs / 1000).toFixed(1)}s
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={() => run(true)} disabled={busy}>{busy ? "Re-running…" : "Run again"}</button>
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}
