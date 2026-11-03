"use client";
import { useEffect, useRef, useState } from 'react';
import { readPrettyPolicy, savePrettyPolicy, grantPrettyLevel } from './pretty-id-actions';
const input = 'mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100';
export default function PrettyIdSettings() {
  const [data, setData] = useState(null), [levels, setLevels] = useState([]), [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const grantKey = useRef(null);
  async function load() {
    try { const result = await readPrettyPolicy(); setData(result); setLevels(result.policies[0]?.levels ?? result.defaults); setEnabled(result.policies[0]?.enabled ?? false); }
    catch { setMessage('Unable to load Pretty ID settings. Check your access and that migrations are applied.'); }
  }
  useEffect(() => {
    let cancelled = false;
    readPrettyPolicy().then(result => {
      if (cancelled) return;
      setData(result); setLevels(result.policies[0]?.levels ?? result.defaults); setEnabled(result.policies[0]?.enabled ?? false);
    }).catch(() => { if (!cancelled) setMessage('Unable to load Pretty ID settings. Check your access and that migrations are applied.'); });
    return () => { cancelled = true; };
  }, []);
  const update = (index, key, value) => setLevels(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  async function run(action) { setBusy(true); try { const result = await action(); setMessage(result.message); return result; } catch { setMessage('Could not confirm the request. Retry with the same details.'); } finally { setBusy(false); } }
  return <section className="space-y-6 border-b border-slate-200 bg-slate-50 p-5 sm:p-6">
    <div><h3 className="text-base font-bold text-slate-900">Weekly Pretty IDs</h3><p className="mt-2 text-sm text-slate-600">Monday to Monday, 00:00 UTC. One highest qualifying entitlement per week. Maintenance uses recharge allowance, never wallet coins.</p></div>
    {message && <p role="status" className="rounded-xl border border-teal-200 bg-white p-4 text-sm text-teal-900">{message}</p>}
    {!data ? <button onClick={load} className="rounded-lg border px-4 py-2">Load settings</button> : <>
      <form onSubmit={async e => { e.preventDefault(); await run(async () => { const result = await savePrettyPolicy(enabled, levels); if (result.success) await load(); return result; }); }}>
        <fieldset disabled={busy} className="space-y-5">
          <label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-5 w-5 accent-teal-700" />Enable weekly recharge qualification from next Monday</label>
          <p className="text-xs text-slate-600">New policy starts {new Date(data.nextWeek).toUTCString()}. Existing IDs keep their granted validity and maintenance terms. Zero maintenance disables renewal offers for that level.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100"><tr>{['Level / length', 'Weekly recharge coins', 'Pattern', 'Maintain (coins)', 'Validity (days)'].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{levels.map((row, i) => <tr key={row.level} className="border-t border-slate-100">
            <td className="p-3 font-semibold">{row.level} · {row.characters} characters</td>
            <td className="p-3"><input aria-label={`Level ${row.level} recharge`} className={input} required pattern="[0-9]+" inputMode="numeric" value={row.thresholdCoins} onChange={e => update(i, 'thresholdCoins', e.target.value)} /></td>
            <td className="p-3"><input aria-label={`Level ${row.level} pattern`} className={input} required pattern={`[A-Z]{${row.characters}}`} maxLength={row.characters} value={row.pattern} onChange={e => update(i, 'pattern', e.target.value.toUpperCase())} /></td>
            <td className="p-3"><input aria-label={`Level ${row.level} maintenance`} className={input} required pattern="[0-9]+" inputMode="numeric" value={row.maintenanceCoins} onChange={e => update(i, 'maintenanceCoins', e.target.value)} /></td>
            <td className="p-3"><input aria-label={`Level ${row.level} validity`} className={input} required type="number" min="1" max="36500" value={row.durationDays} onChange={e => update(i, 'durationDays', Number(e.target.value))} /></td>
          </tr>)}</tbody></table></div>
          <p className="text-xs text-slate-600">Pattern letters represent distinct letters or digits. BBBCCCC allows XXXZZZZ, 1113333 or XXX1111. IDs are case-insensitive.</p>
          <button className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save next-week policy'}</button>
        </fieldset>
      </form>
      <form className="rounded-xl border border-slate-200 bg-white p-5" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget, values = new FormData(form); grantKey.current ??= crypto.randomUUID(); const result = await run(() => grantPrettyLevel(String(values.get('publicId')), Number(values.get('level')), grantKey.current)); if(result?.success) { grantKey.current = null; form.reset(); } }}>
        <h4 className="font-bold">Official manual grant</h4><p className="mt-1 text-xs text-slate-600">Uses the latest saved level settings. Claim reserves the ID; first activation starts its timer. Switching IDs never pauses expiry.</p>
        <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-3"><label className="text-xs font-semibold">Normal user ID<input className={input} name="publicId" required placeholder="USR-…" /></label><label className="text-xs font-semibold">Level<select className={input} name="level">{levels.map(row => <option key={row.level} value={row.level}>Level {row.level} · {row.characters} characters</option>)}</select></label><button className="self-end rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white">Grant entitlement</button></fieldset>
      </form>
      <details className="text-sm"><summary className="cursor-pointer font-semibold">Policy history</summary><ul className="mt-3 space-y-2">{data.policies.map(p => <li key={p.id}>#{p.id} · {new Date(p.effectiveFrom).toUTCString()} · {p.enabled ? 'Enabled' : 'Disabled'}</li>)}</ul></details>
    </>}
  </section>;
}
