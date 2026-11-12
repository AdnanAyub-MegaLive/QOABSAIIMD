import Link from "next/link";


export default function MessageHistoryTable({ records, query, type, kind = "ALL", page, pageSize, total, totalPages, canViewNotifications }) {
  const tabs = [["ALL", "All messages"], ["WORLD", "World Chat"], ...(canViewNotifications ? [["SYSTEM", "System Notifications"]] : []), ["DIRECT", "Personal Messages"], ["ROOM", "Room Chats"], ["GROUP", "Group Chats"]];
  const groups = Map.groupBy(records, record => record.type === "SYSTEM" ? `notification:${record.senderId ?? "global"}` : (record.senderId ?? "deleted"));
  const pageHref = (target) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type !== "ALL") params.set("type", type);
    if (kind !== "ALL") params.set("kind", kind);
    params.set("page", String(target));
    return `/messages?${params}`;
  };
  const visiblePages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => Math.max(1, Math.min(page - 2, totalPages - 4)) + index,
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-[0_8px_30px_rgba(15,65,60,.04)]">
      <nav aria-label="Message categories" className="flex gap-1 overflow-x-auto border-b p-3">{tabs.map(([key, label]) => <Link key={key} href={`/messages?${new URLSearchParams({ type: key, ...(query ? { q: query } : {}), ...(kind !== "ALL" ? { kind } : {}) })}`} aria-current={type === key ? "page" : undefined} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold ${type === key ? "bg-[#e8f5f1] text-[#087f74]" : "text-[#71847f]"}`}>{label}</Link>)}</nav>
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
          <input type="hidden" name="type" value={type} />
          <label className="text-xs">Type <select name="kind" defaultValue={kind} className="h-10 rounded-lg border px-3">
            {[["ALL", "All types"], ["text", "Text"], ["voice", "Voice"], ["picture", "Photo"], ["video", "Video"], ["gift", "Gift"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <button className="rounded-lg bg-[#087f74] px-4 text-xs font-bold text-white">Search</button>
          {(query || type !== "ALL" || kind !== "ALL") && <Link href="/messages" className="grid h-10 place-items-center rounded-lg border border-[#dce6e4] px-3 text-xs font-bold">Clear</Link>}
        </div>
      </form>

      <div className="space-y-4 p-5">
        <p className="text-xs text-[#71847f]">Grouped by sender; system notifications are grouped by recipient. Groups show matching records on this page.</p>
        {[...groups].map(([key, items]) => <details key={key} open className="overflow-hidden rounded-xl border border-[#e1ebe8]">
          <summary className="cursor-pointer bg-[#f6faf8] px-4 py-3 text-sm font-semibold">{items[0].senderName} <span className="ml-2 font-mono text-xs text-[#71847f]">{items[0].senderId || "System / deleted account"}</span><span className="float-right text-xs text-[#71847f]">{items.length} records</span></summary>
          <div className="divide-y divide-[#edf2f1]">{items.map(record => <article key={record.type + record.id} className="p-4">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-[#71847f]"><span>{record.prioritySupport && <strong className="mr-2 rounded bg-purple-100 px-2 py-1 text-purple-800">Priority VIP support</strong>}{typeLabel(record.type)} · {record.destinationName} · {record.destinationId}</span><time>{record.createdAt}</time></div>
            {record.participants.length > 0 && <p className="mt-1 text-xs text-[#71847f]">With {record.participants.map(p => p.name + " (" + p.id + ")").join(", ")}</p>}
            {record.deletedAt && <p className="mt-2 text-xs font-semibold text-red-700">Deleted by {record.deletedBy || "sender/admin"} · {record.deletedAt}</p>}
            <MessageContent record={record} />
            <div className="mt-3 flex gap-3 text-[10px] text-[#71847f]"><span>{record.id}</span>{record.senderId && <Link href={`/users/${encodeURIComponent(record.senderId)}`} className="font-semibold text-[#087f74]">View user profile →</Link>}</div>
          </article>)}</div>
        </details>)}
        {!records.length && <p className="py-12 text-center text-sm text-[#71847f]">No records match this category and search.</p>}
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
  return { WORLD: "World Chat", DIRECT: "Personal Message", ROOM: "Room Chat", SYSTEM: "System Notification", GROUP: "Group Chat" }[type] || type;
}

function safeImage(url) {
  return typeof url === "string" && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) ? url : undefined;
}
function MessageContent({ record }) {
  const base = `/api/admin/messages/${encodeURIComponent(record.id)}`;
  if (record.kind === "voice" && record.hasVoice) return <div className="mt-3"><audio controls preload="none" src={`${base}/voice`} /><span className="text-xs">{Math.ceil((record.voiceDurationMs || 0) / 1000)} seconds</span></div>;
  if (record.kind === "picture" && record.hasMedia) return <a href={`${base}/media`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block"><img src={`${base}/media`} alt="Chat photo - open full size" loading="lazy" className="max-h-48 max-w-xs rounded-lg object-contain" /></a>;
  if (record.kind === "video" && record.hasMedia) return <video controls preload="none" src={`${base}/media`} poster={record.media?.posterUrl ? `${base}/media?poster=1` : undefined} className="mt-3 max-h-72 max-w-full rounded-lg" />;
  if (record.kind === "gift" && record.gift) {
    const gift = record.gift.gift || record.gift;
    const icon = gift.id && (gift.posterUrl || gift.mimeType?.startsWith("image/"))
      ? `/api/uploads/${encodeURIComponent(gift.id)}/file${gift.posterUrl ? "?poster=1" : ""}`
      : safeImage(gift.posterUrl || (gift.mimeType?.startsWith("image/") ? gift.mediaUrl || gift.url : null));
    return <div className="mt-3 flex items-center gap-3">{icon ? <img src={icon} alt="" loading="lazy" className="h-16 w-16 object-contain" /> : <span aria-label="Gift">🎁</span>}<div><strong>{gift.name || "Gift"} ×{gift.quantity ?? 1}</strong><p className="text-xs">To {record.gift.recipient?.name || record.gift.recipientName || record.gift.recipientId || "Unknown recipient"}</p></div></div>;
  }
  return <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#334d49]">{record.body}</p>;
}
