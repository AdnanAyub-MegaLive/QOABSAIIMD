"use client";
import { useEffect, useState } from "react";

const input = "mt-2 h-11 w-full rounded-lg border border-[#cededb] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#16877d]/30";
const amount = value => BigInt(value ?? "0").toLocaleString();
export default function SalaryPanel({ agencies }) {
  const [agencyId, setAgencyId] = useState(agencies[0]?.agencyId ?? "");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [result, setResult] = useState({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!agencyId) return;
    const controller = new AbortController();
    fetch(`/api/admin/agencies/${encodeURIComponent(agencyId)}/salary?month=${encodeURIComponent(month)}`, { signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error?.message || "Unable to load salary report."); return body.data; })
      .then(data => setResult({ data }))
      .catch(error => { if (error.name !== "AbortError") setResult({ error: error.message }); });
    return () => controller.abort();
  }, [agencyId, month, retry]);
  function chooseMonth(value) { if (value !== month) { setResult({ loading: true }); setMonth(value); } }
  if (!agencies.length) return <div className="rounded-xl border border-[#dce8e5] bg-white p-8 text-sm text-[#71847f]">Create an agency to view monthly salary reports.</div>;
  const data = result.data;
  return <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
    <div className="border-b border-[#e6eeec] p-5"><h3 className="text-lg font-bold">Monthly salary statement</h3><p className="mt-1 text-sm text-[#71847f]">Host earnings and agency commission from committed gifts. All periods use UTC.</p><div className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-[#526b67]">Agency<select className={input} value={agencyId} onChange={e => { setResult({ loading: true }); setAgencyId(e.target.value); }}>{agencies.map(a => <option key={a.agencyId} value={a.agencyId}>{a.agency} · {a.agencyId}</option>)}</select></label><label className="text-xs font-semibold text-[#526b67]">Statement month<input className={input} type="month" min="2000-01" max={new Date().toISOString().slice(0, 7)} value={month} onChange={e => { if (e.target.value) chooseMonth(e.target.value); }}/></label></div></div>
    {result.loading && <p role="status" className="p-8 text-sm text-[#71847f]">Loading statement…</p>}
    {result.error && <div role="alert" className="m-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{result.error}<button className="ml-3 underline" onClick={() => { setResult({ loading: true }); setRetry(n => n + 1); }}>Retry</button></div>}
    {data && <><div className="grid gap-3 p-5 sm:grid-cols-3">{[["Accrued host salary", data.totalSalaryCoins], ["Agency commission", data.commissionCoins], ["Gift income", data.giftIncomeCoins]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#dfe9e7] bg-[#f7faf9] p-4"><p className="text-xs font-semibold text-[#71847f]">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{amount(value)} <span className="text-xs font-normal">coins</span></p></div>)}</div>
    <div className="px-5 pb-5"><h4 className="text-sm font-bold">Top earners</h4><div className="mt-3 grid gap-3 sm:grid-cols-3">{data.topEarners.map((h, i) => <div className="rounded-xl border border-[#e1ebe8] p-4" key={h.publicId}><span className="text-xs font-bold text-[#16877d]">#{i + 1}</span><p className="mt-1 font-semibold">{h.name}</p><p className="text-xs text-[#71847f]">{h.publicId}</p><p className="mt-2 text-sm font-bold">{amount(h.salaryCoins)} coins</p></div>)}</div></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f7faf9] text-xs text-[#71847f]"><tr>{["Host", "Gift income", "Salary", "Recorded live minutes", "Recorded active days"].map(h => <th key={h} className="px-5 py-3">{h}</th>)}</tr></thead><tbody>{data.hosts.map(h => <tr key={`${h.kind}:${h.publicId}`} className="border-t border-[#e6eeec]"><td className="px-5 py-4 font-semibold">{h.name}<span className="mt-1 block text-xs font-normal text-[#71847f]">{h.publicId}</span></td><td className="px-5 py-4 tabular-nums">{amount(h.giftIncomeCoins)}</td><td className="px-5 py-4 font-semibold tabular-nums">{amount(h.salaryCoins)}</td><td className="px-5 py-4">{h.liveMinutes}</td><td className="px-5 py-4">{h.activeDays}</td></tr>)}{!data.hosts.length && <tr><td colSpan={5} className="p-8 text-center text-[#71847f]">No hosts or earnings for this period.</td></tr>}</tbody></table></div>
    <p className="m-5 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{data.activityNotice}</p>
    <div className="border-t border-[#e6eeec] p-5"><h4 className="text-sm font-bold">Previous statements</h4><div className="mt-3 flex flex-wrap gap-2">{data.months.map(b => <button key={b.month} onClick={() => chooseMonth(b.month)} className={`rounded-lg border px-4 py-3 text-left text-xs ${b.month === month ? "border-[#16877d] bg-[#e9f7f1]" : "border-[#dce8e5]"}`}><span className="font-bold">{b.month}</span><span className="mt-1 block">{amount(b.totalSalaryCoins)} coins · {b.status.toLowerCase()}</span></button>)}</div></div></>}
  </section>;
}
