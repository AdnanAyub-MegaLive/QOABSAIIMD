"use client";
import { useCallback, useEffect, useState } from "react";

const tabs = [["FAQ", "FAQs"], ["GUIDE", "Guides"], ["SAFETY", "Safety"], ["POLICY", "Policies"], ["SETTINGS", "Settings"]];
const field = "w-full rounded-lg border border-slate-300 bg-white p-2 text-sm";
const button = "rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40";
const primary = `${button} bg-teal-700 text-white`;
const slugify = title => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
function Label({ title, children }) { return <label className="grid gap-1 text-sm font-medium">{title}{children}</label>; }

export default function HelpCenterEditor() {
  const [entries, setEntries] = useState([]), [settings, setSettings] = useState(null);
  const [tab, setTab] = useState("FAQ"), [language, setLanguage] = useState("en");
  const [editing, setEditing] = useState(null), [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [dragged, setDragged] = useState(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/help-center", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Unable to load content.");
    setEntries(result.data.entries); setSettings(result.data.settings);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/admin/help-center", { cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to load content.");
      if (active) { setEntries(result.data.entries); setSettings(result.data.settings); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function save(input) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/help-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to save.");
      await load(); setNotice("Saved. App content refreshes within five minutes."); return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  const visible = entries.filter(e => e.type === tab && e.language === language);
  async function reorder(ids) { await save({ action: "REORDER", type: tab, language, ids }); }
  function move(index, delta) {
    const ids = visible.map(e => e.id), target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]]; reorder(ids);
  }
  function newEntry() {
    setSlugTouched(false); setEditing({ type: tab, language, slug: "", icon: "", iconUrl: null, title: "", summary: "", body: "", sections: [{ heading: "", body: "" }], sortOrder: visible.length ? Math.max(...visible.map(e => e.sortOrder)) + 1 : 0, published: true });
  }
  const change = patch => setEditing(current => ({ ...current, ...patch }));
  function section(index, patch) { change({ sections: editing.sections.map((s, i) => i === index ? { ...s, ...patch } : s) }); }
  function moveSection(index, delta) {
    const sections = [...editing.sections], target = index + delta;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]]; change({ sections });
  }
  async function upload(file) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/admin/help-center/icons", { method: "POST", body: form }), result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Upload failed.");
      change({ iconUrl: result.data.url });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <div><h2 className="text-2xl font-bold">Help Center</h2><p className="mt-1 text-sm text-slate-500">Manage FAQs, guides, safety advice and policies. Translations fall back to English when unavailable.</p></div>
    <nav className="flex flex-wrap gap-2" aria-label="Help Center sections">{tabs.map(([key, name]) => <button key={key} disabled={busy} onClick={() => { setTab(key); setEditing(null); }} aria-current={tab === key ? "page" : undefined} className={tab === key ? primary : button}>{name}</button>)}</nav>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!settings && <p className="text-sm">Loading Help Center…</p>}
    {tab === "SETTINGS" ? settings && <form className="grid max-w-2xl gap-4 rounded-xl border bg-white p-5" onSubmit={e => { e.preventDefault(); save({ action: "SETTINGS", settings }); }}>
      <Label title="Support email"><input className={field} type="email" required maxLength={254} value={settings.supportEmail} onChange={e => setSettings({ ...settings, supportEmail: e.target.value })} /></Label>
      <Label title="Terms URL"><input className={field} type="url" required value={settings.termsUrl} onChange={e => setSettings({ ...settings, termsUrl: e.target.value })} /></Label>
      <Label title="Privacy URL"><input className={field} type="url" required value={settings.privacyUrl} onChange={e => setSettings({ ...settings, privacyUrl: e.target.value })} /></Label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={settings.liveChatEnabled} onChange={e => setSettings({ ...settings, liveChatEnabled: e.target.checked })} />Show Live Chat in the app</label>
      <Label title="Live Chat hours (optional)"><input className={field} maxLength={200} placeholder="10:00–22:00 PKT" value={settings.liveChatHours || ""} onChange={e => setSettings({ ...settings, liveChatHours: e.target.value })} /></Label>
      <button disabled={busy} className={primary}>Save settings</button>
    </form> : <>
      <div className="flex flex-wrap items-end gap-3"><Label title="Language"><input className={field} list="help-languages" maxLength={35} value={language} onChange={e => { setLanguage(e.target.value.toLowerCase()); setEditing(null); }} /></Label><datalist id="help-languages">{[...new Set(["en", "ur", "ar", "hi", "bn", ...entries.map(e => e.language)])].map(l => <option key={l} value={l} />)}</datalist><button disabled={busy || !settings} className={primary} onClick={newEntry}>Add {tab === "FAQ" ? "FAQ" : "article"}</button></div>
      {editing && <form className="space-y-4 rounded-xl border border-teal-300 bg-white p-5" onSubmit={async e => { e.preventDefault(); if (await save({ action: "SAVE_ENTRY", id: editing.id, entry: editing })) setEditing(null); }}>
        <h3 className="font-bold">{editing.id ? "Edit entry" : "New entry"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label title="Type"><select className={field} value={editing.type} onChange={e => change({ type: e.target.value, sections: editing.sections?.length ? editing.sections : [{ heading: "", body: "" }] })}>{tabs.filter(([t]) => t !== "SETTINGS").map(([t, label]) => <option key={t} value={t}>{label}</option>)}</select></Label>
          <Label title="Language"><input className={field} list="help-languages" required maxLength={35} value={editing.language} onChange={e => change({ language: e.target.value.toLowerCase() })} /></Label>
        </div>
        <Label title={editing.type === "FAQ" ? "Question" : "Title"}><input className={field} required maxLength={120} value={editing.title} onChange={e => change({ title: e.target.value, ...(!slugTouched && !editing.id ? { slug: slugify(e.target.value) } : {}) })} /></Label>
        <Label title="Slug"><input className={field} required maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={editing.slug} onChange={e => { setSlugTouched(true); change({ slug: e.target.value }); }} /></Label>
        <div className="grid gap-3 sm:grid-cols-2"><Label title="Icon (emoji or short text)"><input className={field} maxLength={40} value={editing.icon || ""} onChange={e => change({ icon: e.target.value })} /></Label><Label title="Upload icon image (up to 2 MB)"><input className={field} type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={e => upload(e.target.files?.[0])} /></Label></div>
        {editing.iconUrl && <div className="flex items-center gap-3"><img src={editing.iconUrl} alt="Entry icon" className="h-12 w-12 object-contain" /><button type="button" className={button} onClick={() => change({ iconUrl: null })}>Remove image</button><span className="text-xs text-slate-500">The app uses this image instead of the text icon.</span></div>}
        {editing.type === "FAQ" ? <Label title="Answer (plain text)"><textarea className={field} required rows={6} maxLength={2000} value={editing.body || ""} onChange={e => change({ body: e.target.value })} /></Label> : <>
          <Label title="Summary"><input className={field} maxLength={200} value={editing.summary || ""} onChange={e => change({ summary: e.target.value })} /></Label>
          <p className="text-xs text-slate-500">Use plain text and line breaks. Paste full HTTPS links where needed.</p>
          {(editing.sections || []).map((s, i) => <fieldset key={i} className="grid gap-3 rounded-lg border p-3"><legend className="text-sm font-semibold">Section {i + 1}</legend><Label title="Heading"><input className={field} maxLength={120} value={s.heading} onChange={e => section(i, { heading: e.target.value })} /></Label><Label title="Body"><textarea className={field} rows={5} maxLength={4000} value={s.body} onChange={e => section(i, { body: e.target.value })} /></Label><div className="flex gap-2"><button type="button" disabled={!i} className={button} onClick={() => moveSection(i, -1)}>Move up</button><button type="button" disabled={i === editing.sections.length - 1} className={button} onClick={() => moveSection(i, 1)}>Move down</button><button type="button" className={button} onClick={() => change({ sections: editing.sections.filter((_, index) => index !== i) })}>Remove section</button></div></fieldset>)}
          <button type="button" className={button} disabled={(editing.sections?.length || 0) >= 30} onClick={() => change({ sections: [...(editing.sections || []), { heading: "", body: "" }] })}>Add section</button>
        </>}
        <label className="flex gap-2"><input type="checkbox" checked={editing.published} onChange={e => change({ published: e.target.checked })} />Published</label>
        <div className="flex gap-2"><button disabled={busy} className={primary}>Save entry</button><button type="button" disabled={busy} className={button} onClick={() => setEditing(null)}>Cancel</button></div>
      </form>}
      <div className="rounded-xl border bg-white p-4"><p className="mb-3 text-xs text-slate-500">Drag entries to reorder, or use the arrow buttons.</p>
        {visible.map((entry, index) => <div key={entry.id} draggable={!busy} onDragStart={() => setDragged(entry.id)} onDragEnd={() => setDragged(null)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (busy || !dragged || dragged === entry.id) return; const ids = visible.map(e => e.id).filter(id => id !== dragged); ids.splice(index, 0, dragged); setDragged(null); reorder(ids); }} className="flex flex-wrap items-center gap-3 border-b py-3 last:border-0">
          <span aria-hidden="true" className="cursor-grab text-slate-400">⠿</span><div className="min-w-40 flex-1"><p className="font-semibold">{entry.title}</p><p className="text-xs text-slate-500">{entry.slug} · {entry.language}</p></div>
          <label className="flex gap-1 text-xs"><input disabled={busy} type="checkbox" checked={entry.published} onChange={e => save({ action: "SAVE_ENTRY", id: entry.id, entry: { ...entry, published: e.target.checked } })} />Published</label>
          <button disabled={busy || index === 0} aria-label={`Move ${entry.title} up`} className={button} onClick={() => move(index, -1)}>↑</button><button disabled={busy || index === visible.length - 1} aria-label={`Move ${entry.title} down`} className={button} onClick={() => move(index, 1)}>↓</button>
          <button disabled={busy} className={button} onClick={() => { setEditing({ ...entry, sections: entry.sections || [] }); setSlugTouched(true); }}>Edit</button><button disabled={busy} className={button} onClick={() => { if (window.confirm(`Delete “${entry.title}” (${entry.language})?`)) save({ action: "DELETE_ENTRY", id: entry.id }); }}>Delete</button>
        </div>)}
        {!visible.length && <p className="py-8 text-center text-sm text-slate-500">No entries in this language yet.</p>}
      </div>
    </>}
  </div>;
}
