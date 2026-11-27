"use client";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "./intent-link";

import { SERVER_PAGE_SIZE } from "@/lib/portal-paging";

/**
 * Previous / Next for server-rendered lists. The next page is loaded ahead in the
 * background so it opens instantly; the browser keeps visited pages (staleTimes).
 */
export default function ServerPager({ page, hasNext, total, label = "records", search = false, placeholder = "Search ID, name or phone" }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const href = next => {
    const p = new URLSearchParams(params.toString());
    if (next > 1) p.set("page", String(next)); else p.delete("page");
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  useEffect(() => { if (hasNext) router.prefetch(href(page + 1)); }, [hasNext, page, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = e => {
    e.preventDefault();
    const p = new URLSearchParams(params.toString());
    p.delete("page");
    if (query.trim()) p.set("q", query.trim()); else p.delete("q");
    const s = p.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  };
  const pages = total != null ? Math.max(1, Math.ceil(total / SERVER_PAGE_SIZE)) : null;
  return <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce7e4] bg-white p-3">
    {search ? <form onSubmit={submit} className="flex flex-1 flex-wrap items-center gap-2">
      <label className="relative min-w-56 flex-1"><Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#7a8d88]" aria-hidden="true"/>
        <input aria-label={`Search all ${label}`} value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-[#d7e4e1] py-2 pr-3 pl-9 text-sm"/></label>
      <button className="portal-button portal-button-primary">Search</button>
      {params.get("q") && <button type="button" className="portal-button" onClick={() => { setQuery(""); const p = new URLSearchParams(params.toString()); p.delete("q"); p.delete("page"); const s = p.toString(); router.push(s ? `${pathname}?${s}` : pathname); }}>Clear</button>}
    </form> : <span className="text-sm text-[#526e68]">{total != null ? `${total.toLocaleString()} ${label}` : ""}</span>}
    <nav aria-label={`${label} pages`} className="flex items-center gap-2">
      {page > 1 ? <Link className="portal-button" href={href(page - 1)} scroll={false}><ChevronLeft size={15}/>Previous</Link> : <span className="portal-button opacity-50"><ChevronLeft size={15}/>Previous</span>}
      <span className="text-sm text-[#526e68]">Page {page}{pages ? ` of ${pages.toLocaleString()}` : ""}</span>
      {hasNext ? <Link className="portal-button" href={href(page + 1)} scroll={false}>Next<ChevronRight size={15}/></Link> : <span className="portal-button opacity-50">Next<ChevronRight size={15}/></span>}
    </nav>
  </div>;
}
