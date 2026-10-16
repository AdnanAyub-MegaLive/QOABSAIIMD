"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
const input = "w-full rounded-xl border border-[#d9e5e2] bg-white px-3 py-2 text-sm";
export default function RoomBannerManager() {
  const [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [reasons, setReasons] = useState({});
  async function load() { const r = await fetch("/api/admin/room-banners"); const j = await r.json(); if (!r.ok) throw Error(j.error?.message || "Unable to load banners."); setData(j.data); }
  useEffect(() => { let active = true; fetch("/api/admin/room-banners").then(async r => { const j = await r.json(); if (!r.ok) throw Error(j.error?.message || "Unable to load banners."); return j.data; }).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  async function save(body) { setBusy(true); setError(""); try { const r = await fetch("/api/admin/room-banners", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw Error(j.error?.message || "Unable to save."); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  function changePackage(index, key, value) { setData({ ...data, settings: { ...data.settings, packages: data.settings.packages.map((p, i) => i === index ? { ...p, [key]: value } : p) } }); }
  if (!data) return <p role="status">{error || "Loading paid room banners…"}</p>;
  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold">Paid room banners</h2><p className="mt-2 text-sm text-[#71847f]">Owner-only uploads · Two slots per room · Review before publication · JPG, PNG, WebP or GIF up to 5 MB.</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
    <section className="space-y-4 rounded-2xl border border-[#dfe9e7] bg-white p-5">
      <label className="flex gap-2 font-semibold"><input type="checkbox" checked={data.settings.enabled} onChange={e => setData({ ...data, settings: { ...data.settings, enabled: e.target.checked } })}/>Accept paid banner uploads</label>
      <p className="text-sm text-[#71847f]">Pending banners reserve a slot. Duration begins on approval. Rejected or cancelled pending banners receive a full refund. Active banner removal does not refund Coins. Disabling uploads does not remove already-paid banners.</p>
      {data.settings.packages.map((p, i) => <div key={p.id} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="text-sm">Package name<input className={input} value={p.name} onChange={e => changePackage(i, "name", e.target.value)}/></label>
        <label className="text-sm">Active days<input className={input} type="number" min="1" max="365" value={p.durationDays} onChange={e => changePackage(i, "durationDays", Number(e.target.value))}/></label>
        <label className="text-sm">Price in Coins<input className={input} inputMode="numeric" value={p.coins} onChange={e => changePackage(i, "coins", e.target.value)}/></label>
        <button disabled={busy} className="self-end rounded-lg border px-3 py-2 text-sm" onClick={() => setData({ ...data, settings: { ...data.settings, packages: data.settings.packages.filter((_, n) => n !== i) } })}>Remove option</button>
      </div>)}
      <div className="flex gap-3"><button disabled={busy || data.settings.packages.length >= 20} className="rounded-xl border px-4 py-2" onClick={() => setData({ ...data, settings: { ...data.settings, packages: [...data.settings.packages, { id: crypto.randomUUID(), name: "", durationDays: 7, coins: "" }] } })}>Add duration option</button><button disabled={busy} className="rounded-xl bg-[#183f3b] px-5 py-2 text-white disabled:opacity-50" onClick={() => save({ action: "SETTINGS", ...data.settings })}>Save settings</button></div>
    </section>
    <section className="rounded-2xl border border-[#dfe9e7] bg-white p-5"><h3 className="font-bold">Review & moderation</h3><p className="text-xs text-[#71847f]">Latest 200 submissions. Private previews are visible only to the owner and authorized portal staff.</p><div className="mt-4 space-y-4">{data.items.map(b => <article key={b.id} className="grid gap-4 rounded-xl border p-4 md:grid-cols-[180px_1fr_240px]">
      <img src={b.previewUrl} alt="Submitted room banner" className="h-28 w-full rounded-lg object-contain bg-slate-50"/>
      <div><p className="font-semibold">{b.room.title} <span className="text-xs">{b.room.roomId}</span></p><p className="text-sm">{b.owner.name} · {b.owner.publicId}</p><p className="text-sm">{b.status} · {b.coins} Coins · {b.durationDays} days</p>{b.expiresAt && <p className="text-xs">Expires {new Date(b.expiresAt).toLocaleString()}</p>}{b.reason && <p className="mt-2 text-sm text-red-700">{b.reason}</p>}{b.refundedAt && <p className="text-xs text-emerald-700">Refund completed</p>}</div>
      {["PENDING", "ACTIVE"].includes(b.status) && <div className="space-y-2"><input className={input} aria-label="Moderation reason" placeholder="Reason for rejection/removal" maxLength={500} value={reasons[b.id] || ""} onChange={e => setReasons({ ...reasons, [b.id]: e.target.value })}/>{b.status === "PENDING" && <button disabled={busy} className="mr-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white" onClick={() => save({ action: "APPROVE", bannerId: b.id, roomId: b.room.roomId })}>Approve</button>}<button disabled={busy || !reasons[b.id]?.trim()} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50" onClick={() => save({ action: b.status === "PENDING" ? "REJECT" : "DELETE", bannerId: b.id, roomId: b.room.roomId, reason: reasons[b.id] })}>{b.status === "PENDING" ? "Reject & refund" : "Remove (no refund)"}</button></div>}
    </article>)}{!data.items.length && <p className="py-8 text-center text-sm text-[#71847f]">No banner submissions yet.</p>}</div></section>
  </div>;
}
