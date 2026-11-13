"use client";
import { useEffect, useState } from "react";
export default function HostKycReview() {
  const [rows, setRows] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [reasons, setReasons] = useState({});
  useEffect(() => {
    let active = true;
    fetch("/api/admin/host-kyc", { cache: "no-store" }).then(async r => { const j = await r.json(); if (!r.ok) throw Error(j.error?.message); if (active) setRows(j.data.submissions); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function review(row, action) {
    if (!window.confirm(`${action === "APPROVE" ? "Approve" : "Reject"} verification for ${row.user.name}?`)) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/host-kyc", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, action, rejectionReason: reasons[row.id] }) }), j = await r.json();
      if (!r.ok) throw Error(j.error?.message || "Review failed.");
      setRows(current => current.filter(item => item.id !== row.id));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="mb-6 space-y-4 rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">Pending host verification</h2>{error && <p role="alert" className="text-red-700">{error}</p>}{!rows && !error && <p>Loading submissions…</p>}{rows?.length === 0 && <p>No pending submissions.</p>}{rows?.map(row => <article key={row.id} className="space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">{row.user.name} · {row.user.publicId}</h3><p>{row.legalName} · {row.idType} · {new Date(row.submittedAt).toLocaleString(undefined, { timeZone: 'Asia/Bangkok' })}</p>
    <div className="grid gap-4 sm:grid-cols-3">{[["identityCardFront", "Document front"], ["identityCardBack", "Document back"], ["profileImage", "Selfie with document"]].map(([field, label]) => <div key={field}><p className="mb-2 text-sm font-medium">{label}</p>{row.images[field] ? <a href={row.images[field]} target="_blank" rel="noreferrer"><img alt={label} src={row.images[field]} className="h-48 w-full rounded-lg bg-slate-100 object-contain" /></a> : <p className="text-sm text-slate-500">Not supplied</p>}</div>)}</div>
    <label className="block text-sm">Rejection reason<textarea className="mt-1 block w-full rounded border p-2" maxLength={1000} value={reasons[row.id] || ""} onChange={e => setReasons({ ...reasons, [row.id]: e.target.value })} /></label>
    <div className="flex gap-3"><button disabled={busy} className="rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-40" onClick={() => review(row, "APPROVE")}>Approve</button><button disabled={busy || !reasons[row.id]?.trim()} className="rounded border border-red-600 px-4 py-2 text-red-700 disabled:opacity-40" onClick={() => review(row, "REJECT")}>Reject</button></div>
  </article>)}</section>;
}
