"use client";
import { useEffect, useState } from "react";
import { MANAGEMENT_ROLE_ORDER, displayApplicationRole } from "@/lib/user-roles";
import { countryOptions } from "@/lib/geo-country";

export default function ManagementMembers() {
  const [role, setRole] = useState(""), [q, setQ] = useState(""), [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1), [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(true);
  const [refresh, setRefresh] = useState(0);
  function loading() { setBusy(true); setError(""); setData(null); }
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/management-members?${new URLSearchParams({ role, country, q: search, page: String(page) })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error?.message || "Unable to load members."); return body.data; })
      .then(value => { if (!controller.signal.aborted) setData(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [role, country, search, page, refresh]);
  const date = value => value ? new Date(value).toLocaleString() : "Not recorded";
  return <div className="rounded-xl bg-white p-5">
    <h3 className="text-lg font-bold">Active Management Members</h3>
    <p className="my-3 text-sm text-slate-600">Platform Admin directory of active, non-deleted management accounts. Expand a member for contact details and agency assignments. Available means no supervisor assigned, not online status. Target performance is in Targets &amp; Progress.</p>
    <form className="mb-4 flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); loading(); setPage(1); setSearch(q); setRefresh(x => x + 1); }}>
      <input aria-label="Search members" className="rounded border p-2" placeholder="Name, public ID or country" value={q} onChange={e => setQ(e.target.value)} maxLength={100}/>
      <select aria-label="Management role" className="rounded border p-2" value={role} onChange={e => { loading(); setRole(e.target.value); setPage(1); }}>
        <option value="">All management roles</option>{MANAGEMENT_ROLE_ORDER.map(r => <option key={r} value={r}>{displayApplicationRole(r)}</option>)}
      </select>
      <button className="rounded bg-teal-700 px-4 py-2 text-white">Search / Refresh</button>
      <select aria-label="Country" className="rounded border p-2" value={country} onChange={e => { loading(); setCountry(e.target.value); setPage(1); }}>
        <option value="">All countries</option>
        {countryOptions.map(item => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
      </select>
    </form>
    {busy && <p role="status">Loading members…</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
    {data && <><p className="mb-3">{data.total} active members</p>
      {data.members.map(m => <details key={m.publicId} className="mb-3 rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">{m.name} · {m.publicId} · {displayApplicationRole(m.teamRole || m.appRoles.find(r => MANAGEMENT_ROLE_ORDER.includes(r)))} · {m.country || "No country"} — {m.companyBdCountry ? "Official Company BD" : m.supervisor ? `Reports to ${m.supervisor.name}` : "Available / unassigned"}</summary>
        <dl className="my-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries({ Email: m.email || "Not set", Phone: m.phone || "Not set", Roles: m.appRoles.map(displayApplicationRole).join(", "), Status: m.status, Verified: m.isVerified ? "Yes" : "No", Joined: date(m.createdAt), "Last login": date(m.lastLoginAt), "Direct team members": m._count.teamMembers, Supervisor: m.companyBdCountry ? "Company only" : m.supervisor ? `${m.supervisor.name} (${m.supervisor.publicId})` : "Unassigned" }).map(([key, value]) => <div key={key}><dt className="text-slate-500">{key}</dt><dd>{value}</dd></div>)}
        </dl>
        {[["Owned agencies", m.ownedAgencies], ["Directly supervised agencies", m.supervisedAgencies]].map(([label, items]) => <div key={label} className="mt-3"><h4 className="font-semibold">{label} ({items.length})</h4>{items.length ? <ul className="text-sm">{items.map(a => <li key={a.publicId}>{a.name} · {a.publicId} · {a.status}</li>)}</ul> : <p className="text-sm text-slate-500">None</p>}</div>)}
      </details>)}
      {!data.members.length && <p>No active members match these filters.</p>}
      <div className="mt-4 flex items-center gap-3"><button className="rounded border p-2 disabled:opacity-50" disabled={page === 1} onClick={() => { loading(); setPage(p => p - 1); }}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button className="rounded border p-2 disabled:opacity-50" disabled={page * data.pageSize >= data.total} onClick={() => { loading(); setPage(p => p + 1); }}>Next</button></div>
    </>}
  </div>;
}
