"use client";
import { useState } from "react";
export default function PermanentDeleteButton({ assetId, onDone }) {
  const [open, setOpen] = useState(false), [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmation, setConfirmation] = useState("");
  async function perform(action) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/uploads/permanent-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, assetId, token: preview?.token, confirmation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to complete this operation.");
      if (action === "PREVIEW") setPreview(result.data);
      else { setOpen(false); onDone(); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <>
    <button type="button" className="text-xs font-bold text-red-800 underline" onClick={() => { setOpen(true); setPreview(null); setConfirmation(""); perform("PREVIEW"); }}>Permanently Delete</button>
    {open && <div role="dialog" aria-modal="true" aria-label="Permanently delete unused upload" className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4">
      <section className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 text-sm">
        <h3 className="text-lg font-bold">Permanently delete unused upload</h3>
        <p className="my-3">This removes the upload record and stored file bytes from the database. It cannot be undone here. Audit history is retained. External CDN copies, backups and device caches are not erased.</p>
        {busy && <p role="status">Checking or processing…</p>}
        {error && <p role="alert" className="my-3 text-red-700">{error}</p>}
        {preview && <><strong>{preview.name}</strong>{preview.canDelete ? <label className="my-3 block">Type {preview.confirmation}<input className="mt-2 w-full rounded border p-2" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label> : <><p className="my-3">This upload is in use. Archive it instead. Nothing will be deleted.</p><ul>{preview.dependencies.map(row => <li key={row.table}>{row.table}: {row.count}</li>)}</ul></>}</>}
        <div className="mt-4 flex gap-4"><button disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button disabled={busy || !preview?.canDelete || confirmation !== preview.confirmation} className="rounded bg-red-700 p-2 text-white disabled:opacity-40" onClick={() => perform("DELETE")}>Permanently Delete</button></div>
      </section>
    </div>}
  </>;
}
