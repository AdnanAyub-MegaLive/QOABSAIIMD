"use client";
import { useEffect, useState } from "react";

export default function TaskEvidenceQueue() {
  const [view, setView] = useState("actionable"), [pages, setPages] = useState([""]), [data, setData] = useState(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [revision, refresh] = useState(0);
  const cursor = pages.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/daily-tasks?${new URLSearchParams({ view, cursor })}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const result = await response.json(); if (!response.ok) throw Error(result.error?.message || "Unable to load evidence."); return result.data; })
      .then(value => { setData(value); setLoading(false); })
      .catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, [view, cursor, revision]);
  function navigate(next) { setData(null); setLoading(true); setError(""); setPages(next); }
  async function review(id, decision) {
    const reason = window.prompt("Enter your verification findings / reason (required, up to 500 characters)");
    if (!reason?.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/daily-tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: "review", id, decision, reason }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.message || "Unable to review evidence.");
      navigate([""]); refresh(n => n + 1);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border bg-white p-5">
    <h3 className="font-bold">Task evidence review</h3>
    <p className="mt-1 text-xs text-slate-500">Actionable evidence is shown oldest first for the current UTC period. Approval enables claiming; it does not credit Coins. History is read-only and includes expired submissions without changing their records.</p>
    <div className="my-4 flex gap-3">
      <select aria-label="Evidence view" disabled={busy} value={view} onChange={e => { setView(e.target.value); navigate([""]); }} className="rounded-lg border p-2"><option value="actionable">Awaiting review (current)</option><option value="history">All evidence / history</option></select>
      <button disabled={busy || loading} onClick={() => { navigate([""]); refresh(n => n + 1); }}>Refresh</button>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">Loading evidence…</p> : <>
      {!data?.items.length && <p>No evidence in this view.</p>}
      {data?.items.map(row => <article key={row.id} className="my-3 rounded-xl border p-4">
        <b>{row.title}</b><p>{row.user.name} · {row.user.publicId}</p>
        <p className="text-xs text-slate-500">{row.reviewStatus} · Period {new Date(row.periodStart).getTime() === 0 ? "Beginner (once)" : row.periodStart} · Updated {row.updatedAt}</p>
        <p className="my-3 whitespace-pre-wrap break-words">{row.evidence}</p>
        {row.reviewReason && <p className="text-sm">Review: {row.reviewReason}</p>}
        {row.actionable && <div className="flex gap-4">{["APPROVED", "REJECTED"].map(decision => <button key={decision} disabled={busy} className="rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => review(row.id, decision)}>{decision === "APPROVED" ? "Approve" : "Reject"}</button>)}</div>}
      </article>)}
    </>}
    <div className="mt-4 flex gap-4"><button disabled={busy || loading || pages.length < 2} onClick={() => navigate(pages.slice(0, -1))}>Previous</button><span>Page {pages.length}</span><button disabled={busy || loading || !data?.nextCursor} onClick={() => navigate([...pages, data.nextCursor])}>Next</button></div>
  </section>;
}
