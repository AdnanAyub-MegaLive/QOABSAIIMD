"use client";
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
      {search && <><input aria-label="Search all records" placeholder="Search ID or name" maxLength={100} value={query} onChange={e => setQuery(e.target.value)} className="rounded border p-2"/><button className="rounded border px-3">Search</button></>}
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
  return <><button onClick={() => { navigate([""]); setRefresh(n => n + 1); }}>Refresh</button>
    {error ? <p role="alert" className="text-red-700">{error}</p> : !result ? <p role="status">Loading records…</p> : children(result.items)}
    <div className="flex gap-4"><button disabled={!result || pages.length < 2} onClick={() => navigate(pages.slice(0, -1))}>Previous</button><span>Page {pages.length}</span><button disabled={!result?.nextCursor} onClick={() => navigate([...pages, result.nextCursor])}>Next</button></div>
  </>;
}
