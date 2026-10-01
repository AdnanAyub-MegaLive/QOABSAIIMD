"use client";
import { useCallback, useEffect, useState } from "react";
import { hasPermission } from "@/lib/portal-permissions";

const input = "mt-1.5 w-full rounded-xl border border-[#dce7e4] bg-white px-3 py-2 text-sm";
const button = "rounded-lg bg-[#087f74] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const blank = { name: "", email: "", password: "", role: "STAFF", active: true, permissions: [] };
export default function StaffManager() {
  const [data, setData] = useState(null), [draft, setDraft] = useState(null), [reset, setReset] = useState(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [saving, setSaving] = useState(false), [search, setSearch] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/staff", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || "Unable to load accounts.");
    setData(json.data);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/staff", { cache: "no-store", signal: controller.signal })
      .then(async response => { const json = await response.json(); if (!response.ok) throw new Error(json.error?.message || "Unable to load accounts."); return json.data; })
      .then(setData).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, []);
  async function mutate(body) {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "Unable to save account.");
      setDraft(null); setReset(null); await load(); setNotice(body.action === "create" ? "Account created. Share the initial password securely with the staff member." : "Account updated. Existing sessions for this account have been revoked.");
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  const can = p => hasPermission(data?.actor, p);
  function select(keys, enabled) {
    const selected = new Set(draft.permissions);
    for (const key of keys) {
      if (!can(key)) continue;
      if (enabled) { selected.add(key); selected.add(`${key.split(".")[0]}.view`); }
      else { selected.delete(key); if (key.endsWith(".view")) for (const p of selected) if (p.startsWith(key.split(".")[0]+".")) selected.delete(p); }
    }
    setDraft({ ...draft, permissions: [...selected] });
  }
  const grantable = key => can(key) && (draft?.role === "MANAGER" || !key.startsWith("accounts.") || key === "accounts.view");
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">Staff access</h2><p className="mt-1.5 max-w-2xl text-sm text-[#71847f]">Create individual logins and choose what each person can access. Managers can delegate only their own permissions to accounts beneath them.</p></div>{can("accounts.create") && <button className={button} disabled={saving} onClick={() => { setDraft({ ...blank }); setReset(null); setError(""); }}>+ Create account</button>}</div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<button className="ml-3 underline" onClick={() => load().catch(e => setError(e.message))}>Reload accounts</button></div>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {!data && !error && <p className="rounded-xl border bg-white p-6">Loading staff accounts…</p>}
    {draft && data && <form className="space-y-5 rounded-2xl border border-[#dfe9e7] bg-white p-6" onSubmit={e => { e.preventDefault(); mutate({ ...draft, action: draft.id ? "update" : "create" }); }}>
      <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{draft.id ? "Edit account" : "New account"}</h3><button type="button" disabled={saving} onClick={() => setDraft(null)} className="text-sm text-[#71847f]">Cancel</button></div>
      <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Name<input className={input} required minLength={2} maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="text-sm font-semibold">Email<input className={input} type="email" autoComplete="off" required maxLength={254} value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
        {!draft.id && <label className="text-sm font-semibold">Initial password<input className={input} type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} /><span className="text-xs font-normal text-[#71847f]">At least 12 characters. Passwords are never displayed after saving.</span></label>}
        <label className="text-sm font-semibold">Account role<select className={input} value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value, permissions: e.target.value === "STAFF" ? draft.permissions.filter(p => !p.startsWith("accounts.") || p === "accounts.view") : draft.permissions })}><option value="STAFF">Staff</option><option value="MANAGER">Manager — can be given staff administration access</option></select></label>
        <label className="text-sm font-semibold">Status<select className={input} value={String(draft.active)} onChange={e => setDraft({ ...draft, active: e.target.value === "true" })}><option value="true">Active</option><option value="false">Suspended</option></select></label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3"><h4 className="font-semibold">Feature permissions</h4><span className="text-xs text-[#71847f]">{draft.permissions.length} selected</span><select aria-label="Apply permission template" disabled={saving} className="rounded-lg border px-3 py-2 text-sm" value="" onChange={e => setDraft({ ...draft, permissions: data.templates[e.target.value].filter(grantable) })}><option value="" disabled>Apply a template…</option>{Object.keys(data.templates).map(name => <option key={name}>{name}</option>)}</select></div>
      <p className="text-xs text-[#71847f]">Greyed-out permissions are outside your access or require the Manager role. Viewing is required for each feature’s actions. Events has a separate login and permission system.</p>
      <div className="grid gap-4 md:grid-cols-2">{data.groups.map(group => {
        const available = group.permissions.map(p => p.key).filter(grantable);
        return <fieldset key={group.key} disabled={saving} className="rounded-xl border border-[#dfe9e7] p-4"><legend className="px-1 text-sm font-bold">{group.label}</legend>
          <label className="mb-3 flex items-center gap-2 border-b border-[#edf2f0] pb-3 text-xs font-semibold"><input type="checkbox" disabled={!available.length} checked={available.length > 0 && available.every(key => draft.permissions.includes(key))} onChange={e => select(available, e.target.checked)} />Select available permissions</label>
          <div className="space-y-2.5">{group.permissions.map(p => <label key={p.key} className={`flex items-start gap-2 text-sm ${!grantable(p.key) ? "text-[#a1aeaa]" : "text-[#435e57]"}`}><input className="mt-1 shrink-0" type="checkbox" disabled={!grantable(p.key)} checked={draft.permissions.includes(p.key)} onChange={e => select([p.key], e.target.checked)} /><span>{p.label}</span></label>)}</div>
        </fieldset>;
      })}</div>
      <div className="flex flex-wrap items-center gap-4 border-t border-[#edf2f0] pt-5"><button className={button} disabled={saving}>{saving ? "Saving…" : "Save account"}</button><p className="text-xs text-[#71847f]">Saved changes take effect immediately. You cannot edit your own access or a higher-level account.</p></div>
    </form>}
    {reset && <form className="space-y-4 rounded-2xl border border-[#dfe9e7] bg-white p-6" onSubmit={e => { e.preventDefault(); mutate({ action: "reset", ...reset }); }}><h3 className="font-bold">Reset password — {reset.email}</h3><label className="block max-w-md text-sm">New password<input type="password" autoComplete="new-password" className={input} minLength={12} maxLength={72} required value={reset.password} onChange={e => setReset({ ...reset, password: e.target.value })} /></label><button className={button} disabled={saving}>Reset and revoke sessions</button><button className="ml-4 text-sm" type="button" onClick={() => setReset(null)}>Cancel</button></form>}
    {data && <><label className="block max-w-sm text-sm font-semibold">Find an account<input className={input} type="search" placeholder="Name or email" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="overflow-x-auto rounded-2xl border border-[#dfe9e7] bg-white"><table className="w-full text-left text-sm"><thead className="bg-[#edf5f2] text-xs text-[#57716a]"><tr>{["Account", "Role / Status", "Access", "Last login", "Actions"].map(h => <th className="p-4" key={h}>{h}</th>)}</tr></thead><tbody>{data.accounts.filter(a => `${a.name} ${a.email}`.toLowerCase().includes(search.toLowerCase())).map(a => <tr key={a.id} className="border-t border-[#edf2f0]"><td className="p-4"><strong>{a.name}</strong><p className="text-xs text-[#71847f]">{a.email}</p><p className="mt-1 text-xs text-[#71847f]">Created by {data.accounts.find(parent => parent.id === a.createdById)?.name || (a.createdById ? "Manager" : "Platform")}</p></td><td className="p-4"><p>{a.role === "SUPER_ADMIN" ? "Platform Manager" : a.role}</p><span className={`text-xs ${a.active ? "text-emerald-700" : "text-red-700"}`}>{a.active ? "Active" : "Suspended"}</span></td><td className="p-4">{a.role === "SUPER_ADMIN" ? "Full access" : `${a.permissions.length} permissions`}</td><td className="whitespace-nowrap p-4 text-xs text-[#71847f]">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "Never signed in"}</td><td className="p-4"><div className="flex flex-wrap gap-3">{a.editable && can("accounts.manage") && <button disabled={saving} className="font-semibold text-[#087f74]" onClick={() => { setDraft({ ...a, password: "" }); setReset(null); }}>Edit</button>}{a.editable && can("accounts.reset") && <><button disabled={saving} className="text-[#087f74]" onClick={() => { setReset({ id: a.id, email: a.email, sessionVersion: a.sessionVersion, password: "" }); setDraft(null); }}>Reset password</button><button disabled={saving} className="text-[#a84d43]" onClick={() => mutate({ action: "revoke", id: a.id, sessionVersion: a.sessionVersion })}>Revoke sessions</button></>}{!a.editable && <span className="text-xs text-[#71847f]">Protected account</span>}</div></td></tr>)}</tbody></table></div>
      <section className="rounded-2xl border border-[#dfe9e7] bg-white p-6"><h3 className="font-bold">Access change history</h3><div className="mt-3 divide-y divide-[#edf2f0]">{data.logs.map(log => <div key={log.id} className="py-3 text-sm"><p>{log.description}</p><p className="mt-1 text-xs text-[#71847f]">{new Date(log.createdAt).toLocaleString()}</p></div>)}{!data.logs.length && <p className="py-5 text-sm text-[#71847f]">No staff access changes yet.</p>}</div></section></>}
  </div>;
}
