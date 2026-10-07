"use client";
import { useEffect, useState } from "react";

export default function ModerationHistory({ roomId }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/room-management/history?roomId=${encodeURIComponent(roomId)}&page=${page}`, { signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Unable to load history."); return body.data; })
      .then(setResult).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [roomId, page]);
  function changePage(next) { setResult(null); setError(""); setPage(next); }
  return <section className="rounded-2xl border border-[#dfe9e7] bg-white p-5">
    <h3 className="font-bold">Moderation history</h3>
    <p className="mt-1 text-xs text-[#71847f]">Actions recorded for {roomId} only, including portal administration.</p>
    {error ? <p role="alert" className="py-4 text-red-700">{error}</p> : !result ? <p className="py-6 text-sm">Loading history…</p> : <>
      <div className="mt-3 divide-y">{result.logs.map(log => <article key={log.id} className="py-3 text-sm"><b>{log.action.replaceAll("_", " ")}</b><p className="mt-1 text-xs text-[#71847f]">{log.actor}{log.target ? ` → ${log.target}` : ""} · {new Date(log.createdAt).toLocaleString()}</p>{log.reason && <p className="mt-1 whitespace-pre-wrap text-sm text-[#526b67]">{log.reason}</p>}</article>)}</div>
      {!result.logs.length && <p className="py-8 text-sm text-[#71847f]">No moderation actions recorded for this room.</p>}
    </>}
    <div className="mt-4 flex items-center justify-end gap-3 text-xs"><button disabled={page === 1} onClick={() => changePage(page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page}</span><button disabled={!result?.hasMore} onClick={() => changePage(page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>
  </section>;
}
