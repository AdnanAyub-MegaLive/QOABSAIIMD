"use client";
import { useRef, useState } from "react";
import { listPrettyCombinations, savePrettyCombination, removePrettyCombination, addPrettyCombinationIds, removePrettyCombinationId } from "./pretty-combination-actions";

const input = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const blank = { id: null, pattern: "", price: "", durationDays: 30, visible: true };

export default function PrettyCombinations() {
  const [items, setItems] = useState(null), [form, setForm] = useState(blank), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [open, setOpen] = useState(null), [codes, setCodes] = useState("");
  const formRef = useRef(null);
  function edit(row) { setForm({ id: row.id, pattern: row.pattern, price: row.coinPrice, durationDays: row.durationDays, visible: row.storeVisible }); setMessage(""); requestAnimationFrame(() => { formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); formRef.current?.querySelector("input[inputmode=numeric]")?.focus(); }); }
  async function refresh() { setItems(await listPrettyCombinations()); }
  async function load() { setBusy(true); try { await refresh(); } catch { setMessage("Could not load combinations."); } finally { setBusy(false); } }
  async function run(action, after) { setBusy(true); try { const result = await action(); setMessage(result.message); if (result.success) after?.(); await refresh(); } catch { setMessage("Could not confirm the request. Try again."); } finally { setBusy(false); } }
  return <section className="space-y-5 border-b border-slate-200 bg-slate-50 p-5 sm:p-6">
    <div><h3 className="text-base font-bold text-slate-900">ID combinations for the Mall</h3><p className="mt-2 text-sm text-slate-600">1. Create a combination with its price. 2. Add the IDs that fit it. 3. Tick “Listed in Mall” and the IDs appear in the app’s Mall under their length. Weekly Pretty IDs above are not affected.</p></div>
    {message && <p role="status" className="rounded-xl border border-teal-200 bg-white p-4 text-sm text-teal-900">{message}</p>}
    {!items ? <button onClick={load} disabled={busy} className="rounded-lg border px-4 py-2">Load combinations</button> : <>
      <form ref={formRef} className={`rounded-xl border bg-white p-5 ${form.id ? "border-teal-500 ring-2 ring-teal-200" : "border-slate-200"}`} onSubmit={e => { e.preventDefault(); run(() => savePrettyCombination(form.id, { pattern: form.pattern, price: form.price, durationDays: Number(form.durationDays), visible: form.visible }), () => setForm(blank)); }}>
        <h4 className="font-bold">{form.id ? `Edit ${form.pattern}` : "Create combination"}</h4>
        <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-4">
          <label className="text-xs font-semibold">Combination (3–7 letters)<input className={input} required pattern="[A-Za-z]{3,7}" maxLength={7} placeholder="AABBCCD" value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value.toUpperCase() })} /></label>
          <label className="text-xs font-semibold">Coin price per ID<input className={input} required pattern="[0-9]+" inputMode="numeric" placeholder="4000000" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></label>
          <label className="text-xs font-semibold">Validity (days)<input className={input} required type="number" min="1" max="36500" value={form.durationDays} onChange={e => setForm({ ...form, durationDays: e.target.value })} /></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold"><input type="checkbox" checked={form.visible} onChange={e => setForm({ ...form, visible: e.target.checked })} />Listed in Mall</label>
        </fieldset>
        <p className="mt-3 text-xs text-slate-600">Same letter = same character, different letters = different characters. AABBCCD fits 1122334 or XXYYZZ7. ABABCCD fits 1212334.</p>
        <div className="mt-4 flex gap-3"><button disabled={busy} className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : form.id ? "Save changes" : "Create combination"}</button>{form.id && <button type="button" onClick={() => setForm(blank)} className="rounded-xl border px-5 py-3 text-sm">Cancel</button>}</div>
      </form>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-100"><tr>{["Combination", "Length", "Price per ID", "Validity", "Mall", "IDs", "Action"].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>
        {!items.length && <tr><td className="p-3 text-slate-500" colSpan={7}>No combinations yet.</td></tr>}
        {items.map(row => [<tr key={row.id} className="border-t border-slate-100">
          <td className="p-3 font-semibold">{row.pattern}</td><td className="p-3">{row.characters}</td><td className="p-3">{Number(row.coinPrice).toLocaleString()}</td><td className="p-3">{row.durationDays} days</td><td className="p-3">{row.storeVisible ? "Listed" : "Hidden"}</td><td className="p-3">{row.ids.length}</td>
          <td className="p-3"><div className="flex gap-2"><button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => { setOpen(open === row.id ? null : row.id); setCodes(""); }}>{open === row.id ? "Close" : "IDs"}</button><button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => edit(row)}>{form.id === row.id ? "Editing…" : "Edit"}</button><button type="button" className="rounded border px-3 py-1 text-xs text-red-700" disabled={busy} onClick={() => { if (window.confirm(`Remove ${row.pattern} and hide its IDs from the Mall?`)) run(() => removePrettyCombination(row.id)); }}>Remove</button></div></td>
        </tr>, open === row.id && <tr key={row.id + "-ids"} className="border-t border-slate-100 bg-slate-50"><td colSpan={7} className="p-4">
          <form onSubmit={e => { e.preventDefault(); run(() => addPrettyCombinationIds(row.id, codes), () => setCodes("")); }}>
            <label className="text-xs font-semibold">Add IDs for {row.pattern} (one per line, or separated by commas)<textarea className={input + " h-24 font-mono"} disabled={busy} value={codes} onChange={e => setCodes(e.target.value.toUpperCase())} placeholder={row.pattern} /></label>
            <button disabled={busy || !codes.trim()} className="mt-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add IDs</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">{!row.ids.length && <span className="text-xs text-slate-500">No IDs yet.</span>}{row.ids.map(item => <span key={item.id} className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-mono">{item.code}{item.sold ? <span className="text-teal-700">sold</span> : <button type="button" disabled={busy} className="text-red-700" aria-label={`Remove ${item.code}`} onClick={() => run(() => removePrettyCombinationId(item.id))}>✕</button>}</span>)}</div>
        </td></tr>])}
      </tbody></table></div>
    </>}
  </section>;
}
