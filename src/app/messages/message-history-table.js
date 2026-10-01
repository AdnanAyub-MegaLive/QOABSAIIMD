import Link from "next/link";

const typeStyles = {
  WORLD: "bg-sky-50 text-sky-700",
  DIRECT: "bg-violet-50 text-violet-700",
  ROOM: "bg-emerald-50 text-emerald-700",
};

export default function MessageHistoryTable({ records, query, type, page, pageSize, total, totalPages }) {
  const pageHref = (target) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type !== "ALL") params.set("type", type);
    params.set("page", String(target));
    return `/messages?${params}`;
  };
  const visiblePages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => Math.max(1, Math.min(page - 2, totalPages - 4)) + index,
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-[0_8px_30px_rgba(15,65,60,.04)]">
      <form method="GET" className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xl">
          <svg className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 fill-none stroke-[#80938f] stroke-2" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            name="q"
            defaultValue={query}
            className="h-10 w-full rounded-lg border border-[#dce6e4] bg-[#fafcfc] pr-3 pl-9 text-xs outline-none focus:border-[#2ca89c]"
            placeholder="Search user, message, room, conversation, or ID..."
            aria-label="Search message history"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select name="type" defaultValue={type} className="h-10 rounded-lg border border-[#dce6e4] bg-white px-3 text-xs text-[#536863]" aria-label="Filter message type">
            <option value="ALL">All messages</option>
            <option value="WORLD">World Chat</option>
            <option value="DIRECT">Private conversations</option>
            <option value="ROOM">Audio rooms</option>
          </select>
          <button className="rounded-lg bg-[#087f74] px-4 text-xs font-bold text-white">Search</button>
          {(query || type !== "ALL") && <Link href="/messages" className="grid h-10 place-items-center rounded-lg border border-[#dce6e4] px-3 text-xs font-bold">Clear</Link>}
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#748883] uppercase">
            <tr>
              <th className="px-5 py-3.5">Date & time</th>
              <th>Type</th>
              <th>Sender</th>
              <th>Destination</th>
              <th className="px-5">Message</th>
              <th className="px-5">Message ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f1]">
            {records.map((record) => (
              <tr key={`${record.type}-${record.id}`} className="align-top hover:bg-[#f9fcfb]">
                <td className="whitespace-nowrap px-5 py-4 text-[#687c77]">{record.createdAt}</td>
                <td className="py-4"><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${typeStyles[record.type]}`}>{typeLabel(record.type)}</span></td>
                <td className="py-4">
                  {record.senderId ? (
                    <Link href={`/users/${encodeURIComponent(record.senderId)}`} target="_blank" className="font-bold text-[#087f74] hover:underline">
                      {record.senderName}<span className="mt-0.5 block font-mono text-[9px] font-normal text-[#71847f]">{record.senderId}</span>
                    </Link>
                  ) : <span className="text-[#7d8f8b]">Deleted user</span>}
                </td>
                <td className="max-w-xs py-4 pr-4">
                  <p className="font-semibold text-[#334d49]">{record.destinationName}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-[#71847f]">{record.destinationId}</p>
                  {record.participants.length > 0 && <p className="mt-1 text-[9px] text-[#80918d]">With {record.participants.map((participant, index) => <span key={participant.id}>{index ? ", " : ""}<Link href={`/users/${encodeURIComponent(participant.id)}`} target="_blank" className="text-[#087f74] hover:underline">{participant.name} ({participant.id})</Link></span>)}</p>}
                </td>
                <td className="max-w-xl px-5 py-4"><p className="whitespace-pre-wrap break-words leading-5 text-[#405853]">{record.body}</p></td>
                <td className="px-5 py-4 font-mono text-[9px] text-[#71847f]">{record.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length && <div className="py-16 text-center text-sm text-[#788b87]">No stored messages match this search.</div>}
      </div>

      <div className="flex flex-col gap-3 border-t border-[#e8efed] px-5 py-4 text-[10px] text-[#849691] sm:flex-row sm:items-center sm:justify-between">
        <span>Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} messages</span>
        <nav className="flex items-center gap-1" aria-label="Message history pagination">
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

function typeLabel(type) {
  return type === "WORLD" ? "World Chat" : type === "DIRECT" ? "Private" : "Audio Room";
}
