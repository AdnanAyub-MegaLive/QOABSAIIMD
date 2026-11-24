import Link from "next/link";
import { requirePagePermission } from "@/lib/portal-admin";
import { CS_LEGACY_COUNTRIES, CS_ROOM_COUNTRIES } from "@/lib/cs-rooms";
import { prisma } from "../../../lib/prisma";
import RoomManagementShell from "../../components/room-management-shell";
import { csRoomMessageWhere } from "@/lib/cs-room-history";

const pageSize = 50;
const countries = [...CS_ROOM_COUNTRIES, ...CS_LEGACY_COUNTRIES];
const formatTime = (value) => value?.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }) ?? null;

export default async function CsRoomMessagesPage({ searchParams }) {
  await requirePagePermission("messages.view");
  const params = await searchParams;
  const query = String(params?.q ?? "").trim().slice(0, 200);
  const requestedCountry = String(params?.country ?? "ALL").toUpperCase();
  const country = countries.includes(requestedCountry) ? requestedCountry : "ALL";
  const requestedPage = Number.parseInt(String(params?.page ?? "1"), 10);
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where = csRoomMessageWhere({ country, query });
  const total = await prisma.csRoomMessage.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(currentPage, totalPages);
  const rows = await prisma.csRoomMessage.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: { publicId: true, country: true, body: true, createdAt: true, deletedAt: true, deletedById: true, clearedAt: true, clearedById: true, sender: { select: { publicId: true, name: true } } },
  });
  const staffIds = [...new Set(rows.flatMap((row) => [row.deletedById, row.clearedById]).filter(Boolean))];
  const staff = staffIds.length ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, publicId: true, name: true } }) : [];
  const staffById = new Map(staff.map((user) => [user.id, `${user.name} (${user.publicId})`]));
  const pageHref = (target) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (country !== "ALL") search.set("country", country);
    search.set("page", String(target));
    return `/messages/cs-room?${search}`;
  };
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => Math.max(1, Math.min(page - 2, totalPages - 4)) + index);

  return (
    <RoomManagementShell title="Message History">
      <div>
        <div className="mb-7">
          <h2 className="text-2xl font-bold">CS Room chat history</h2>
          <p className="mt-1.5 text-sm text-[#71847f]">Stored CS Room messages, including messages deleted or cleared by support staff.</p>
        </div>
        <div className="overflow-hidden portal-panel rounded-2xl border border-[#dce8e5] bg-white shadow-[0_8px_30px_rgba(15,65,60,.04)]">
          <nav aria-label="Message categories" className="flex gap-1 overflow-x-auto border-b p-3">
            <Link href="/messages" className="shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-[#71847f]">All messages</Link>
            <Link href="/messages/cs-room" aria-current="page" className="shrink-0 rounded-lg bg-[#e8f5f1] px-4 py-2 text-xs font-semibold text-[#087f74]">CS Room</Link>
          </nav>
          <form method="GET" className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 lg:flex-row lg:items-center lg:justify-between">
            <input name="q" defaultValue={query} className="h-10 w-full rounded-lg border border-[#dce6e4] bg-[#fafcfc] px-3 text-xs outline-none focus:border-[#2ca89c] lg:max-w-xl" placeholder="Search user name, user ID, message, or message ID..." aria-label="Search CS Room messages" />
            <div className="flex flex-wrap gap-2">
              <label className="text-xs">Country <select name="country" defaultValue={country} className="h-10 rounded-lg border px-3">
                <option value="ALL">All countries</option>
                {countries.map((code) => <option key={code} value={code}>{code}</option>)}
              </select></label>
              <button className="rounded-lg bg-[#087f74] px-4 text-xs font-bold text-white">Search</button>
              {(query || country !== "ALL") && <Link href="/messages/cs-room" className="grid h-10 place-items-center rounded-lg border border-[#dce6e4] px-3 text-xs font-bold">Clear</Link>}
            </div>
          </form>
          <div className="divide-y divide-[#edf2f1]">
            {rows.map((row) => <article key={row.publicId} className="p-4">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-[#71847f]">
                <span><strong className="text-[#334d49]">{row.sender?.name ?? "Deleted user"}</strong> <span className="font-mono">{row.sender?.publicId ?? ""}</span> · CS Room {row.country}</span>
                <time>{formatTime(row.createdAt)}</time>
              </div>
              {row.deletedAt && <p className="mt-2 text-xs font-semibold text-red-700">Deleted by {staffById.get(row.deletedById) ?? "support staff"} · {formatTime(row.deletedAt)}</p>}
              {row.clearedAt && <p className="mt-2 text-xs font-semibold text-amber-700">Cleared by {staffById.get(row.clearedById) ?? "support staff"} · {formatTime(row.clearedAt)}</p>}
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#334d49]">{row.body}</p>
              <div className="mt-3 flex gap-3 text-[10px] text-[#71847f]"><span>{row.publicId}</span>{row.sender?.publicId && <Link href={`/users/${encodeURIComponent(row.sender.publicId)}`} className="font-semibold text-[#087f74]">View user profile →</Link>}</div>
            </article>)}
            {!rows.length && <p className="py-12 text-center text-sm text-[#71847f]">No CS Room messages match this search.</p>}
          </div>
          <div className="flex flex-col gap-3 border-t border-[#e8efed] px-5 py-4 text-[10px] text-[#849691] sm:flex-row sm:items-center sm:justify-between">
            <span>Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} messages</span>
            <nav className="flex items-center gap-1" aria-label="CS Room message pagination">
              <PageLink href={pageHref(page - 1)} disabled={page <= 1}>Previous</PageLink>
              {visiblePages.map((number) => <PageLink key={number} href={pageHref(number)} active={number === page}>{number}</PageLink>)}
              <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>Next</PageLink>
            </nav>
          </div>
        </div>
      </div>
    </RoomManagementShell>
  );
}

function PageLink({ href, disabled, active, children }) {
  const classes = `rounded-md border px-2.5 py-1.5 font-bold ${active ? "border-[#087f74] bg-[#087f74] text-white" : "border-[#dce6e4] bg-white text-[#536863]"}`;
  return disabled ? <span className={`${classes} cursor-not-allowed opacity-40`}>{children}</span> : <Link href={href} className={classes}>{children}</Link>;
}
