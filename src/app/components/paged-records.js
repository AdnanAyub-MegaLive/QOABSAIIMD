"use client";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

// Remount the page on filter changes; abort superseded requests and never show
// stale records under a different filter. Mutations stay with existing callers.
export default function PagedRecords({ endpoint, filters = [], search = false, children, revision = 0 }) {
  const [values, setValues] = useState(() => Object.fromEntries(filters.map(f => [f.name, f.options[0]])));
  const [query, setQuery] = useState(""), [submitted, setSubmitted] = useState("");
  const params = new URLSearchParams({ ...values, ...(search ? { q: submitted } : {}) }).toString();
  return <div className="space-y-4">
    <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); setSubmitted(query.trim()); }}>
      {filters.map(f => <label key={f.name} className="text-sm">{f.label} <select className="rounded border p-2" value={values[f.name]} onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}>{f.options.map(o => <option key={o}>{o}</option>)}</select></label>)}
      {search && <><input aria-label="Search all records" placeholder="Search ID or name" maxLength={100} value={query} onChange={e => setQuery(e.target.value)} className="rounded border p-2"/><button className="portal-button portal-button-primary">Search</button></>}
    </form>
    <RecordPage key={`${endpoint}:${params}:${revision}`} endpoint={endpoint} params={params}>{children}</RecordPage>
  </div>;
}
function RecordPage({ endpoint, params, children }) {
  const [pages, setPages] = useState([""]), [result, setResult] = useState(null), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const cursor = pages.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${endpoint}?${params}&cursor=${encodeURIComponent(cursor)}`, { signal: controller.signal, cache: "no-store" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw Error(j.error?.message || "Unable to load records."); return j.data; })
      .then(value => { if (!controller.signal.aborted) setResult(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [endpoint, params, cursor, refresh]);
  function navigate(next) { setResult(null); setError(""); setPages(next); }
  return <><button type="button" className="portal-button" disabled={!result && !error} onClick={() => { navigate([""]); setRefresh(n => n + 1); }}><RefreshCw size={15}/>Refresh</button>
    {error ? <p role="alert" className="text-red-700">{error}</p> : !result ? <div role="status" className="portal-panel space-y-3 p-6"><p className="text-sm text-[#526e68]">Loading records…</p>{[1,2,3].map(n=><div key={n} className="h-10 animate-pulse rounded-lg bg-[#eef4f2]"/>)}</div> : children(result.items)}
    <nav aria-label="Record pages" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce7e4] bg-white p-3"><button className="portal-button" disabled={!result || pages.length < 2} onClick={() => navigate(pages.slice(0, -1))}><ChevronLeft size={15}/>Previous</button><span>Page {pages.length}</span><button className="portal-button" disabled={!result?.nextCursor} onClick={() => navigate([...pages, result.nextCursor])}>Next<ChevronRight size={15}/></button></nav>
  </>;
}
