"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardChart({ charts, days }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const chart = charts.find(c => c.title === selected) ?? charts[0];
  const max = chart?.points.reduce((n, p) => BigInt(p.value) > n ? BigInt(p.value) : n, 1n) ?? 1n;
  const total = chart?.points.reduce((n, p) => n + BigInt(p.value), 0n) ?? 0n;
  return <section className="rounded-2xl border border-[#dce8e5] bg-white p-6 shadow-[0_8px_30px_rgba(15,65,60,.04)]">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-base font-bold">Platform activity</h3><p className="mt-1 text-[11px] text-[#81928e]">{chart?.detail ?? "No chart data available for your permissions"}</p></div><select aria-label="Chart period" value={days} onChange={e => router.push(`/home?days=${e.target.value}`)} className="h-9 rounded-lg border border-[#dce6e4] px-3 text-[10px] text-[#60736f]"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></div>
    <div className="mt-4 flex flex-wrap items-center gap-2">{charts.map(c => <button key={c.title} aria-pressed={c.title === chart?.title} onClick={() => setSelected(c.title)} className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${c.title === chart?.title ? "bg-[#e4f6f3] text-[#087f74]" : "text-[#81928e] hover:bg-[#f4f8f7]"}`}>{c.title}</button>)}{chart && <span className="ml-auto text-[11px] font-bold text-[#087f74]">{total.toLocaleString("en-US")} {chart.unit}</span>}</div>
    <div className="mt-8 flex h-52 items-end justify-between gap-2 border-b border-[#e6eeec] px-2" role="img" aria-label={`${chart?.title ?? "Activity"}: ${total} ${chart?.unit ?? ""}`}>
      {chart?.points.map(p => <div key={p.day} className="flex h-full flex-1 items-end" title={`${p.day}: ${BigInt(p.value).toLocaleString("en-US")} ${chart.unit}`}><span className="w-full rounded-t-sm bg-linear-to-t from-[#158e82] to-[#55d7c7] opacity-80" style={{ height: `${Number(BigInt(p.value) * 10000n / max) / 100}%` }} /></div>)}
    </div>
    <div className="mt-3 flex justify-between text-[9px] text-[#93a19e]">{chart?.points.filter((_, i, rows) => days === 7 || i === 0 || i === rows.length - 1 || i % 5 === 0).map(p => <span key={p.day}>{p.day.slice(5)}</span>)}</div>
    {total === 0n && <p className="mt-3 text-[10px] text-[#81928e]">No activity recorded in this period.</p>}
    {chart && <details className="mt-4 text-[10px] text-[#81928e]"><summary className="cursor-pointer font-semibold text-[#087f74]">Daily values · UTC · today is partial</summary><div className="mt-2 max-h-40 overflow-y-auto"><table className="w-full text-left"><thead><tr><th>Date</th><th>{chart.unit}</th></tr></thead><tbody>{chart.points.map(p => <tr key={p.day}><td className="py-1">{p.day}</td><td>{BigInt(p.value).toLocaleString("en-US")}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
