"use client";
import { useEffect, useState } from "react";

const input = "h-10 w-full rounded-xl border border-[#d6e4e1] px-3 text-sm outline-none focus:border-[#0f766e]";
const button = "h-10 rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white disabled:opacity-50";

function expected(rows) {
  const valid = rows.map((row) => ({ m: Number(row.multiplier), w: Number(row.weight) })).filter((row) => Number.isFinite(row.m) && Number.isInteger(row.w) && row.w > 0);
  const total = valid.reduce((sum, row) => sum + row.w, 0);
  return total ? valid.reduce((sum, row) => sum + row.m * row.w, 0) / total * 100 : 0;
}

export default function LuckyGiftSettings({ canManage }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [adjust, setAdjust] = useState({ coins: "", note: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = (next) => { setData(next); setForm({ poolContributionPercent: String(next.poolContributionPercent), bigWinMinCoins: next.bigWinMinCoins, multipliers: next.multipliers.map((row) => ({ ...row, weight: String(row.weight) })) }); };
  useEffect(() => {
    let active = true;
    fetch("/api/admin/lucky-gifts").then(async (r) => { const j = await r.json(); if (!r.ok) throw Error(j.error?.message); return j.data; })
      .then((next) => { if (active) apply(next); }).catch((e) => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, []);
  const send = async (method, body, done) => {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/admin/lucky-gifts", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw Error(j.error?.message);
      apply(j.data); done?.(); setMessage("Saved.");
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  if (!form) return <section className="mt-6 rounded-2xl border border-[#dce8e5] bg-white p-6"><h3 className="text-lg font-bold">Lucky Gifts</h3><p className="mt-3 text-sm text-[#71847f]">{message || "Loading…"}</p></section>;
  const rtp = expected(form.multipliers);
  const pool = Number(form.poolContributionPercent);
  const setRow = (index, key, value) => setForm({ ...form, multipliers: form.multipliers.map((row, i) => (i === index ? { ...row, [key]: value } : row)) });
  const totalWeight = form.multipliers.reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
  return <section className="mt-6 rounded-2xl border border-[#dce8e5] bg-white p-6">
    <h3 className="text-lg font-bold">Lucky Gifts</h3>
    <p className="my-3 text-sm text-[#71847f]">Every Lucky Gift send rolls one multiplier from this table. The sender gets gift value × multiplier back, paid only from the Lucky pool. If the pool cannot cover the rolled multiplier, a smaller affordable one is rolled instead. Host Diamonds for each gift are set in the gift upload/edit form.</p>
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      {[["Pool balance", data.pool.balance], ["Collected into pool", data.pool.collected], ["Paid to senders", data.pool.paidOut]].map(([label, value]) => <div key={label} className="rounded-xl bg-[#f4f8f7] p-4"><p className="text-xs text-[#71847f]">{label}</p><p className="mt-1 text-xl font-bold">{Number(value).toLocaleString()} Coins</p></div>)}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Share of each Lucky Gift added to the pool (%)<input className={input} type="number" min="0" max="100" step="0.01" disabled={!canManage} value={form.poolContributionPercent} onChange={(e) => setForm({ ...form, poolContributionPercent: e.target.value })} /></label>
      <label className="text-sm font-semibold">Big-win banner from (Coins won)<input className={input} type="number" min="0" step="1" disabled={!canManage} value={form.bigWinMinCoins} onChange={(e) => setForm({ ...form, bigWinMinCoins: e.target.value })} /></label>
    </div>
    <table className="mt-5 w-full text-sm"><thead><tr className="text-left text-xs text-[#71847f]"><th className="py-2">Multiplier (×)</th><th>Chance weight</th><th>Chance</th><th></th></tr></thead><tbody>
      {form.multipliers.map((row, index) => <tr key={index} className="border-t border-[#eef3f2]">
        <td className="py-2 pr-3"><input className={input} disabled={!canManage} value={row.multiplier} onChange={(e) => setRow(index, "multiplier", e.target.value)} /></td>
        <td className="pr-3"><input className={input} type="number" min="0" step="1" disabled={!canManage} value={row.weight} onChange={(e) => setRow(index, "weight", e.target.value)} /></td>
        <td className="pr-3 text-[#71847f]">{totalWeight ? ((Number(row.weight) || 0) / totalWeight * 100).toFixed(3) : "0"}%</td>
        <td>{canManage && form.multipliers.length > 1 && <button type="button" className="text-xs font-bold text-[#b42318]" onClick={() => setForm({ ...form, multipliers: form.multipliers.filter((_, i) => i !== index) })}>Remove</button>}</td>
      </tr>)}
    </tbody></table>
    {canManage && form.multipliers.length < 20 && <button type="button" className="mt-2 text-sm font-bold text-[#0f766e]" onClick={() => setForm({ ...form, multipliers: [...form.multipliers, { multiplier: "", weight: "0" }] })}>+ Add multiplier</button>}
    <p className={`mt-4 rounded-xl px-4 py-3 text-sm ${rtp > pool ? "bg-[#fff4e5] text-[#8a4b08]" : "bg-[#ecfdf3] text-[#05603a]"}`}>Expected return to senders: <b>{rtp.toFixed(2)}%</b> of gift value. Pool share: <b>{Number.isFinite(pool) ? pool : 0}%</b>.{rtp > pool ? " The return is higher than the pool share, so the pool will empty over time and large wins will be scaled down." : " The pool will grow over time."}</p>
    {canManage && <button type="button" disabled={busy} className={`${button} mt-4`} onClick={() => send("PUT", { version: data.version, poolContributionPercent: form.poolContributionPercent, bigWinMinCoins: form.bigWinMinCoins, multipliers: form.multipliers })}>Save Lucky Gift settings</button>}
    {canManage && <div className="mt-6 border-t border-[#eef3f2] pt-5"><h4 className="font-bold">Adjust pool balance</h4><p className="mb-3 text-xs text-[#71847f]">Add Coins to fund early wins, or enter a negative number to remove Coins. Recorded in the audit log.</p>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto]"><input className={input} placeholder="Coins, e.g. 100000" value={adjust.coins} onChange={(e) => setAdjust({ ...adjust, coins: e.target.value })} /><input className={input} placeholder="Reason" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} /><button type="button" disabled={busy} className={button} onClick={() => send("POST", adjust, () => setAdjust({ coins: "", note: "" }))}>Apply</button></div></div>}
    {message && <p className="mt-3 text-sm text-[#71847f]">{message}</p>}
  </section>;
}
