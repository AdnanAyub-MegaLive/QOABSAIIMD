import Link from "next/link";
import { prisma } from "../../lib/prisma.js";

export default async function EventsDashboardPage() {
  const [total, published, draft, archived, uploads, recent, latest] = await Promise.all([
    prisma.event.count(),
    prisma.event.count({ where: { status: "PUBLISHED" } }),
    prisma.event.count({ where: { status: "DRAFT" } }),
    prisma.event.count({ where: { status: "ARCHIVED" } }),
    prisma.uploadLog.count(),
    prisma.uploadLog.findMany({
      include: { user: { select: { name: true } }, event: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.event.findMany({
      where: { status: "PUBLISHED" },
      include: { createdBy: { select: { name: true } } },
      orderBy: { publishedAt: "desc" },
      take: 5,
    }),
  ]);
  const metrics = [["Total Events", total], ["Published", published], ["Draft", draft], ["Archived", archived], ["Total Uploads", uploads]];
  return (
    <>
      <div className="flex items-end justify-between gap-5"><div><h2 className="text-3xl font-black">Dashboard</h2><p className="mt-1 text-slate-500">Publishing activity across the Events module.</p></div><Link href="/events-management/events" className="text-sm font-bold text-[#0c796b]">View all events →</Link></div>
      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-3 text-3xl font-black">{value}</p></article>)}
      </section>
      <div className="mt-7 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="text-lg font-black">Recent uploads</h3><div className="mt-4 divide-y divide-slate-100">{recent.length ? recent.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-bold">{item.event?.name || "Deleted event"}</p><p className="text-sm text-slate-500">{item.user?.name || "Deleted user"} · {item.action.replaceAll("_", " ")}</p></div><time className="text-xs text-slate-400">{item.createdAt.toLocaleString()}</time></div>) : <p className="py-8 text-sm text-slate-500">No uploads yet.</p>}</div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="text-lg font-black">Latest published</h3><div className="mt-4 divide-y divide-slate-100">{latest.length ? latest.map((event) => <div key={event.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-bold">{event.name}</p><p className="text-sm text-slate-500">/{event.slug} · Version {event.version}</p></div><a target="_blank" rel="noreferrer" href={`/event/${event.slug}`} className="text-sm font-bold text-[#0c796b]">Open ↗</a></div>) : <p className="py-8 text-sm text-slate-500">No published events.</p>}</div></section>
      </div>
    </>
  );
}
