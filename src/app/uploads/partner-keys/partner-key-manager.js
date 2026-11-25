'use client';
import { useEffect, useState } from 'react';

const splitOrigins = (text) => text.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);

async function call(url, options) {
  const r = await fetch(url, { cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) } });
  const b = await r.json();
  if (!r.ok) throw Error(b.error?.message || 'Request failed');
  return b.data;
}

export default function PartnerKeyManager() {
  const [rows, setRows] = useState([]), [name, setName] = useState(''), [origins, setOrigins] = useState(''), [rawKey, setRawKey] = useState(''), [edits, setEdits] = useState({}), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function load() { setRows(await call('/api/admin/partner-keys')); }
  useEffect(() => {
    const controller = new AbortController();
    call('/api/admin/partner-keys', { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setRows(data); }).catch((e) => { if (!controller.signal.aborted) setMessage(e.message); });
    return () => controller.abort();
  }, []);
  async function act(task, done) {
    setBusy(true); setMessage('');
    try { await task(); setMessage(done); await load(); } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  const create = () => act(async () => {
    const data = await call('/api/admin/partner-keys', { method: 'POST', body: JSON.stringify({ name, allowedOrigins: splitOrigins(origins) }) });
    setRawKey(data.rawKey); setName(''); setOrigins('');
  }, 'Key created. Copy it now; it will not be shown again.');
  const saveOrigins = (row) => act(() => call(`/api/admin/partner-keys/${row.id}`, { method: 'PATCH', body: JSON.stringify({ allowedOrigins: splitOrigins(edits[row.id] ?? row.allowedOrigins.join('\n')) }) }), 'Website origins updated.');
  const revoke = (row) => { if (window.confirm(`Revoke ${row.name}? The store will stop working immediately.`)) act(() => call(`/api/admin/partner-keys/${row.id}`, { method: 'DELETE' }), 'Key revoked.'); };
  return <div className="space-y-6 p-6 text-slate-900">
    <p>Partner keys let an external web store read Mall item names and protected preview media. Send the key server-to-server in the X-Partner-Key header only. Leave website origins empty to skip the website check.</p>
    <div className="space-y-3 rounded-xl border bg-white p-5">
      <h2 className="font-bold">Create partner key</h2>
      <input className="block w-full max-w-md rounded border p-2" aria-label="Partner name" placeholder="Partner / store name" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea className="block w-full max-w-md rounded border p-2" rows={3} aria-label="Allowed website origins" placeholder="https://store.example.com (one per line)" value={origins} onChange={(e) => setOrigins(e.target.value)} />
      <button className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50" disabled={busy || !name.trim()} onClick={create}>Create key</button>
      {rawKey && <div className="rounded border border-amber-400 bg-amber-50 p-3"><p className="font-semibold">New key (shown once):</p><code className="block break-all">{rawKey}</code><button className="mt-2 rounded border p-2" onClick={() => { navigator.clipboard?.writeText(rawKey); }}>Copy</button> <button className="mt-2 rounded border p-2" onClick={() => setRawKey('')}>I saved it</button></div>}
    </div>
    <p role="status">{message}</p>
    <div className="overflow-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Name</th><th>Prefix</th><th>Website origins</th><th>Last used</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id} className="border-t align-top">
        <td className="p-2">{row.name}<div className="text-xs text-slate-500">{row.id}</div></td>
        <td className="p-2"><code>{row.keyPrefix}…</code></td>
        <td className="p-2"><textarea className="w-64 rounded border p-1 text-sm" rows={2} aria-label={`Origins for ${row.name}`} disabled={!row.active} value={edits[row.id] ?? row.allowedOrigins.join('\n')} onChange={(e) => setEdits({ ...edits, [row.id]: e.target.value })} /></td>
        <td className="p-2">{row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : 'Never'}</td>
        <td className="p-2">{row.active ? 'Active' : `Revoked ${row.revokedAt ? new Date(row.revokedAt).toLocaleString() : ''}`}</td>
        <td className="p-2 space-x-2">{row.active && <><button className="rounded border p-2 disabled:opacity-50" disabled={busy} onClick={() => saveOrigins(row)}>Save origins</button><button className="rounded border border-red-600 p-2 text-red-700 disabled:opacity-50" disabled={busy} onClick={() => revoke(row)}>Revoke</button></>}</td>
      </tr>)}
    </tbody></table></div>
  </div>;
}
