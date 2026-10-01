import Link from "next/link";

const categoryStyles = {
  USER_MANAGEMENT: "bg-blue-50 text-blue-700",
  TALENT_MANAGEMENT: "bg-purple-50 text-purple-700",
  FINANCE: "bg-emerald-50 text-emerald-700",
  SECURITY: "bg-red-50 text-red-700",
  AUTHENTICATION: "bg-amber-50 text-amber-700",
  SYSTEM: "bg-slate-100 text-slate-700",
};

export default function AuditLogTable({ logs, query, category, page, pageSize, total, totalPages }) {
  const pageHref = (target) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category !== "All") params.set("category", category);
    params.set("page", String(target));
    return `/audit-logs?${params}`;
  };
  const visiblePages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => Math.max(1, Math.min(page - 2, totalPages - 4)) + index,
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-[0_8px_30px_rgba(15,65,60,.04)]">
      <form method="GET" className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 sm:flex-row sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <svg
            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 fill-none stroke-[#80938f] stroke-2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            name="q"
            defaultValue={query}
            className="h-10 w-full rounded-lg border border-[#dce6e4] bg-[#fafcfc] pr-3 pl-9 text-xs outline-none focus:border-[#2ca89c]"
            placeholder="Search admin, user/host ID or activity..."
            aria-label="Search audit logs"
          />
        </div>
        <div className="flex gap-2"><select
          name="category"
          defaultValue={category}
          className="h-10 rounded-lg border border-[#dce6e4] bg-white px-3 text-xs text-[#536863]"
        >
          <option>All</option>
          <option>USER_MANAGEMENT</option>
          <option value="TALENT_MANAGEMENT">HOST_MANAGEMENT</option>
          <option>FINANCE</option>
          <option>SECURITY</option>
          <option>AUTHENTICATION</option>
          <option>SYSTEM</option>
        </select><button className="rounded-lg bg-[#087f74] px-4 text-xs font-bold text-white">Search</button>{(query || category !== "All") && <Link href="/audit-logs" className="grid place-items-center rounded-lg border border-[#dce6e4] px-3 text-xs font-bold">Clear</Link>}</div>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[950px] text-left">
          <thead>
            <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#748883] uppercase">
              <th className="px-5 py-3.5">Date & Time</th>
              <th>Administrator</th>
              <th>Category</th>
              <th>Action</th>
              <th>Record</th>
              <th className="px-5">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f1]">
            {logs.map((log) => (
              <tr key={log.id} className="text-xs hover:bg-[#f9fcfb]">
                <td className="px-5 py-4 text-[#687c77]">{log.createdAt}</td>
                <td>
                  <p className="font-semibold">{log.adminName}</p>
                  <p className="text-[9px] text-[#8a9a96]">{log.adminEmail}</p>
                </td>
                <td>
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-bold ${categoryStyles[log.category] ?? categoryStyles.SYSTEM}`}
                  >
                    {displayAuditLabel(log.category)}
                  </span>
                </td>
                <td className="font-semibold text-[#405853]">
                  {displayAuditLabel(log.action)}
                </td>
                <td className="font-mono text-[10px] text-[#087f74]">
                  {log.entityId ?? "—"}
                </td>
                <td className="max-w-sm px-5 text-[#60736f]">
                  <p>{log.description}</p>
                  {log.reason && (
                    <p className="mt-1 text-[10px] text-[#899995]">
                      <span className="font-semibold">Reason:</span>{" "}
                      {log.reason}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!logs.length && (
          <div className="py-16 text-center text-sm text-[#788b87]">
            No audit records match the selected filters.
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-[#e8efed] px-5 py-4 text-[10px] text-[#849691] sm:flex-row sm:items-center sm:justify-between">
        <span>Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} audit records</span>
        <nav className="flex items-center gap-1" aria-label="Audit log pagination">
          <PageLink href={pageHref(page - 1)} disabled={page <= 1}>Previous</PageLink>
          {visiblePages.map((number) => <PageLink key={number} href={pageHref(number)} active={number === page}>{number}</PageLink>)}
          <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>Next</PageLink>
        </nav>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, active, children }) {
  const classes = `rounded-md border px-2.5 py-1.5 font-bold ${active ? "border-[#087f74] bg-[#087f74] text-white" : "border-[#dce6e4] bg-white text-[#536863]"}`;
  return disabled ? <span className={`${classes} cursor-not-allowed opacity-40`}>{children}</span> : <Link href={href} className={classes}>{children}</Link>;
}

function displayAuditLabel(value) {
  return value
    .replaceAll("_", " ")
    .replaceAll("TALENTS", "HOSTS")
    .replaceAll("TALENT", "HOST");
}
