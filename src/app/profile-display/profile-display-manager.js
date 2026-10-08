"use client";
import { useEffect, useState } from "react";
const input = "mt-2 w-full rounded-lg border border-[#dce7e4] bg-white p-3 text-sm";
export default function ProfileDisplayManager() {
  const [data, setData] = useState(null), [tab, setTab] = useState("ROLE"), [message, setMessage] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => { fetch("/api/admin/profile-display").then(r => r.json()).then(j => { if (!j.success) throw new Error(j.error.message); setData(j.data); }).catch(e => setMessage(e.message)); }, []);
  async function submit(event) {
    event.preventDefault(); setSaving(true); setMessage("");
    const body = { action: tab, ...Object.fromEntries(new FormData(event.currentTarget)), pinned: new FormData(event.currentTarget).get("pinned") === "on" };
    try { const r = await fetch("/api/admin/profile-display", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error.message); setMessage(`Saved: ${j.data.id}`); }
    catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }
  function assets(name, category, title) { return <label className="block text-sm font-semibold">{title}<select name={name} className={input}><option value="">None</option>{data.assets.filter(a => a.category === category).map(a => <option key={a.publicId} value={a.publicId}>{a.name} · {a.publicId}</option>)}</select></label>; }
  return <div className="space-y-5"><h2 className="text-2xl font-bold">Profile artwork & awards</h2><p className="text-sm text-[#71847f]">Upload separate artwork through Uploads. Changes never grant application roles. Agency changes also require agency-management permission.</p><nav className="flex flex-wrap gap-2">{[["ROLE", "Role badges"], ["AGENCY", "Agency identity"], ["MEDAL", "Award medal"], ["REVOKE_MEDAL", "Revoke medal"]].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm ${tab === key ? "bg-[#087f74] text-white" : "bg-white"}`}>{label}</button>)}</nav>{message && <p role="status" className="rounded-xl bg-white p-4 text-sm">{message}</p>}{data && <form key={tab} onSubmit={submit} className="max-w-2xl space-y-4 rounded-2xl border border-[#dce7e4] bg-white p-6">
    {tab === "ROLE" && <><label className="block text-sm font-semibold">Role<select name="code" className={input}>{data.roles.map(r => <option key={r.code}>{r.code}</option>)}</select></label><label className="block text-sm font-semibold">Display label<input required maxLength={80} name="label" className={input}/></label>{assets("assetPublicId", "ROLE_ARTWORK", "Graphical badge")}</>}
    {tab === "AGENCY" && <><label className="block text-sm font-semibold">Agency public ID<input name="agencyId" required placeholder="AGN-123456" className={input}/></label><label className="block text-sm font-semibold">Agency level<input type="number" min="0" max="10000" name="level" required className={input}/></label>{assets("logoAssetPublicId", "AGENCY_ARTWORK", "Logo")}{assets("badgeAssetPublicId", "AGENCY_ARTWORK", "Badge")}</>}
    {tab === "MEDAL" && <><label className="block text-sm font-semibold">User public ID<input name="userId" required placeholder="USR-123456" className={input}/></label>{assets("assetPublicId", "MEDALS", "Earned medal")}<label className="block text-sm font-semibold">Expiry (optional)<input type="datetime-local" name="expiresAt" className={input}/></label><label className="block text-sm"><input type="checkbox" name="pinned"/> Pin at the front of the wall</label></>}
    {tab === "REVOKE_MEDAL" && <label className="block text-sm font-semibold">Medal grant ID<input name="medalId" required placeholder="MEDAL-…" className={input}/></label>}
    <button disabled={saving} className="rounded-xl bg-[#183f3b] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
  </form>}</div>;
}
