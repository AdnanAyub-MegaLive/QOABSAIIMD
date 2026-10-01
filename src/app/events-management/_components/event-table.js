"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("streamline_events_csrf="))?.split("=")[1] || "");

export default function EventTable({ initialEvents, superAdmin, fixedStatus }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(fixedStatus || "");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const events = useMemo(() => initialEvents.filter((event) =>
    (!status || event.status === status) &&
    (!query || `${event.name} ${event.slug}`.toLowerCase().includes(query.toLowerCase()))
  ), [initialEvents, query, status]);

  async function action(event, name, body) {
    if (name === "delete" && !confirm(`Delete ${event.name} and every stored version?`)) return;
    setBusy(`${event.id}:${name}`);
    setMessage("");
    const endpoint =
      name === "delete"
        ? `/api/events/${event.id}`
        : `/api/events/${event.id}/${name}`;
    const response = await fetch(endpoint, {
      method: name === "delete" ? "DELETE" : "POST",
      headers: { "x-events-csrf": csrf(), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    setBusy("");
    if (!response.ok) return setMessage(result.error?.message || "Action failed.");
    router.refresh();
  }

  return (
    <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or slug…" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-[#0c796b]" />
        {!fixedStatus && <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5"><option value="">All statuses</option><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select>}
      </div>
      {message && <p className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700">{message}</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Name","Slug","Version","Status","Uploaded By","Created Date","Actions"].map((h) => <th key={h} className="px-5 py-4">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{events.map((event) => <tr key={event.id} className="hover:bg-slate-50/70">
          <td className="px-5 py-4 font-bold">{event.name}</td><td className="px-5 py-4 font-mono text-xs">{event.slug}</td><td className="px-5 py-4">v{event.version} <span className="text-slate-400">/ {event.latestVersion}</span></td>
          <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${event.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-700" : event.status === "DRAFT" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>{event.status}</span></td>
          <td className="px-5 py-4">{event.createdBy?.name || "Deleted user"}</td><td className="px-5 py-4 text-slate-500">{new Date(event.createdAt).toLocaleDateString()}</td>
          <td className="px-5 py-4"><div className="flex flex-wrap gap-2">
            <a href={`/event/${event.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold">View</a>
            {event.status === "PUBLISHED" ? <button disabled={busy} onClick={() => action(event, "unpublish")} className="rounded-lg border border-amber-200 px-2.5 py-1.5 font-semibold text-amber-700">Unpublish</button> : <button disabled={busy} onClick={() => action(event, "publish")} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 font-semibold text-emerald-700">Publish</button>}
            <a href={`/events-management/events/upload?event=${event.id}`} className="rounded-lg border border-sky-200 px-2.5 py-1.5 font-semibold text-sky-700">New version</a>
            {superAdmin && event.versions?.length > 1 && <select aria-label="Rollback version" defaultValue="" onChange={(e) => e.target.value && action(event, "rollback", { version: Number(e.target.value) })} className="rounded-lg border border-violet-200 px-2 py-1.5 font-semibold text-violet-700"><option value="">Rollback</option>{event.versions.filter((v) => v.version !== event.version).map((v) => <option key={v.id} value={v.version}>v{v.version}</option>)}</select>}
            {superAdmin && event.status !== "ARCHIVED" && <button disabled={busy} onClick={() => action(event, "archive")} className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-600">Archive</button>}
            {superAdmin && <button disabled={busy} onClick={() => action(event, "delete")} className="rounded-lg border border-rose-200 px-2.5 py-1.5 font-semibold text-rose-700">Delete</button>}
          </div></td>
        </tr>)}</tbody></table></div>
      {!events.length && <p className="p-10 text-center text-slate-500">No matching events.</p>}
    </section>
  );
}
