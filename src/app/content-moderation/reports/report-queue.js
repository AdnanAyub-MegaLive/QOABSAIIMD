"use client";
import { useEffect, useState } from "react";
export default function ReportQueue({ canReview }) {
  const [status, setStatus] = useState("OPEN"), [data, setData] = useState(null), [error, setError] = useState(""), [cursor, setCursor] = useState(""), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/reports?${new URLSearchParams({ status, cursor })}`, { cache: "no-store", signal: controller.signal }).then(async r => { const body = await r.json(); if (!r.ok) throw Error(body.error?.message); return body.data; }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [status, cursor, refresh]);
  return <section className="space-y-4"><h2 className="text-xl font-bold">User and room reports</h2><p>Review reports here. Closing a report does not automatically ban an account or room.</p>
    <select aria-label="Report status" className="rounded border p-2" value={status} onChange={e => { setStatus(e.target.value); setCursor(""); setData(null); setError(""); }}>{["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"].map(s => <option key={s}>{s}</option>)}</select>
    {error && <p role="alert" className="text-red-700">{error}</p>}{!data && !error && <p>Loading reports…</p>}
    {data?.items.map(r => <article className="rounded border bg-white p-4" key={r.id}><h3 className="font-bold">{r.targetType}: {r.targetId}</h3><p className="text-xs">{r.publicId} · {new Date(r.createdAt).toLocaleString()}</p><p>Reason: {r.reason}</p><p className="whitespace-pre-wrap break-words">{r.details}</p>{r.roomId && <p>Room: {r.roomId}</p>}<p className="text-xs">Reporter account: {r.reporterUserId}</p>
      {canReview ? <form key={`${r.id}:${r.reviewedAt}`} className="mt-3 space-y-2" onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); setError(""); try { const response = await fetch("/api/admin/reports", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: r.publicId, status: form.get("status"), reviewNote: form.get("note") }) }); const body = await response.json(); if (!response.ok) throw Error(body.error?.message); setData(null); setRefresh(v => v + 1); } catch (e) { setError(e.message); } }}>
        <select aria-label="Review status" name="status" defaultValue={r.status} className="rounded border p-2">{["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"].map(s => <option key={s}>{s}</option>)}</select><textarea aria-label="Review note" name="note" maxLength={1000} defaultValue={r.reviewNote} className="block w-full rounded border p-2"/><button className="rounded bg-teal-700 px-4 py-2 text-white">Save review</button>
      </form> : <p>{r.reviewNote}</p>}</article>)}
    {data && !data.items.length && <p>No reports in this status.</p>}{data?.nextCursor && <button onClick={() => { setCursor(data.nextCursor); setData(null); }}>Next page</button>}
  </section>;
}
