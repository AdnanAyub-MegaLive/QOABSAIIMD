import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import { prisma } from "../../lib/prisma";

export default async function DashboardHome() {
  const session = await auth();
  if (!session?.user) redirect("/");
  const firstName = session.user.name?.split(" ")[0] ?? "Admin";
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(todayStart); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const [totalUsers, userHosts, activeTalents, liveAudioRooms, liveVideoSessions, giftsToday, recentLogs, recentRooms, recentSessions] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, appRoles: { has: "HOST" }, status: "ACTIVE" } }),
    prisma.talent.count({ where: { status: "ACTIVE" } }),
    prisma.audioRoom.findMany({ where: { status: "LIVE" }, select: { participantCount: true } }),
    prisma.liveSession.findMany({ where: { status: "LIVE" }, select: { peakViewers: true } }),
    prisma.giftTransaction.aggregate({ where: { createdAt: { gte: todayStart } }, _sum: { coinValue: true }, _count: true }),
    prisma.auditLog.findMany({ include: { admin: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.audioRoom.findMany({ where: { startedAt: { gte: sevenDaysAgo } }, select: { startedAt: true } }),
    prisma.liveSession.findMany({ where: { startedAt: { gte: sevenDaysAgo } }, select: { startedAt: true } }),
  ]);
  const activeHosts = userHosts + activeTalents;
  const audioLive = liveAudioRooms.length;
  const videoLive = liveVideoSessions.length;
  const audience = liveAudioRooms.reduce((sum, room) => sum + room.participantCount, 0) + liveVideoSessions.reduce((sum, stream) => sum + stream.peakViewers, 0);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(sevenDaysAgo); date.setDate(date.getDate() + index); const next = new Date(date); next.setDate(next.getDate() + 1); const count = recentRooms.filter((item) => item.startedAt >= date && item.startedAt < next).length + recentSessions.filter((item) => item.startedAt >= date && item.startedAt < next).length; return { label: index === 6 ? "Today" : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count }; });
  const maxActivity = Math.max(1, ...days.map((day) => day.count));
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0">
            <p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">
              Admin portal
            </p>
            <h1 className="text-xl font-bold">Dashboard</h1>
          </div>
          <FeatureSearch />
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{session.user.name}</p>
              <p className="text-xs text-[#718580]">{session.user.email}</p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="rounded-lg border border-[#d7e4e1] bg-white px-4 py-2 text-xs font-semibold text-[#526b67] hover:bg-[#f1f7f5]">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-[#16877d]">
                {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                {greeting}, {firstName}.
              </h2>
              <p className="mt-1.5 text-sm text-[#71847f]">
                Here is what is happening across your platform today.
              </p>
            </div>
            <Link href="/audit-logs" className="grid h-10 place-items-center rounded-lg border border-[#d7e4e1] bg-white px-4 text-xs font-semibold text-[#526b67] hover:bg-[#f1f7f5]">
              View audit report
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Total users", totalUsers.toLocaleString(), "Live data", "Users / Senders", "/users"],
              [
                "Active hosts",
                activeHosts.toLocaleString(),
                "Live data",
                "Video & Audio Hosts",
                "/talents",
              ],
              ["Live now", (audioLive + videoLive).toLocaleString(), "Live data", "Video & Audio", "/users?tab=Audio%20Room%20Records"],
              ["Gifts today", (giftsToday._sum.coinValue ?? 0n).toLocaleString(), `${giftsToday._count} transactions`, "Total gift value", "/users?tab=Gift%20Sending%20History"],
            ].map(([label, value, change, detail, href]) => (
              <Link
                key={label}
                href={href}
                className="group rounded-xl border border-[#dfe9e7] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#aed4cf] hover:shadow-[0_10px_25px_rgba(15,65,60,.06)]"
              >
                <div className="flex justify-between">
                  <p className="text-[11px] font-semibold text-[#768984]">
                    {label}
                  </p>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">
                    {change}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold">{value}</p>
                <div className="mt-3 flex justify-between text-[10px] text-[#879792]">
                  <span>{detail}</span>
                  <span className="text-[#16877d] opacity-0 group-hover:opacity-100">
                    View →
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
            <section className="rounded-2xl border border-[#dce8e5] bg-white p-6 shadow-[0_8px_30px_rgba(15,65,60,.04)]">
              <div className="flex justify-between">
                <div>
                  <h3 className="text-base font-bold">Platform activity</h3>
                  <p className="mt-1 text-[11px] text-[#81928e]">
                    Streaming activity during the last seven days
                  </p>
                </div>
                <select className="h-9 rounded-lg border border-[#dce6e4] px-3 text-[10px] text-[#60736f]">
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                </select>
              </div>
              <div className="mt-8 flex h-52 items-end justify-between gap-2 border-b border-[#e6eeec] px-2">
                {days.map((day) => (
                    <div key={day.label} className="flex h-full flex-1 items-end" title={`${day.count} sessions`}>
                      <span
                        className="w-full rounded-t-sm bg-linear-to-t from-[#158e82] to-[#55d7c7] opacity-80"
                        style={{ height: `${Math.max(3, (day.count / maxActivity) * 100)}%` }}
                      />
                    </div>
                  ))}
              </div>
              <div className="mt-3 flex justify-between text-[9px] text-[#93a19e]">
                {days.map((day)=><span key={day.label}>{day.label}</span>)}
              </div>
            </section>
            <section className="rounded-2xl bg-linear-to-br from-[#0a3c38] to-[#0b625a] p-6 text-white shadow-[0_12px_32px_rgba(9,73,68,.15)]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#54e2cf] shadow-[0_0_0_5px_rgba(84,226,207,.12)]" />
                <p className="text-xs font-bold">Live network</p>
              </div>
              <p className="mt-2 text-[10px] text-[#88bbb5]">
                Live database activity
              </p>
              <div className="mt-8 space-y-5">
                {[
                  ["Video streams", videoLive.toLocaleString(), `${videoLive + audioLive ? (videoLive / (videoLive + audioLive)) * 100 : 0}%`],
                  ["Audio rooms", audioLive.toLocaleString(), `${videoLive + audioLive ? (audioLive / (videoLive + audioLive)) * 100 : 0}%`],
                  ["Current audience", audience.toLocaleString(), "100%"],
                ].map(([label, value, width]) => (
                  <div key={label}>
                    <div className="mb-2 flex justify-between text-[11px]">
                      <span className="text-[#a8ceca]">{label}</span>
                      <strong>{value}</strong>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#4fdac8]"
                        style={{ width }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
              <div className="border-b border-[#e6eeec] px-5 py-4">
                <h3 className="text-sm font-bold">Management</h3>
                <p className="mt-0.5 text-[10px] text-[#849590]">
                  Quick access to platform records
                </p>
              </div>
              <div className="divide-y divide-[#edf2f1]">
                <ManagementLink
                  href="/users"
                  title="Users / Senders"
                  detail="Users, gifts, devices, bans, levels and history"
                  color="bg-[#e4f6f3] text-[#087f74]"
                />
                <ManagementLink
                  href="/talents"
                  title="Host Management"
                  detail="Video and audio hosts, verification, salary and gifts"
                  color="bg-[#fff3e4] text-[#ad6c20]"
                />
                <ManagementLink
                  href="/agencies"
                  title="Agency Management"
                  detail="Rankings, targets, applications and salaries"
                  color="bg-[#eee9ff] text-[#6953b5]"
                />
                <ManagementLink
                  href="/events-login"
                  title="Events Management"
                  detail="Host, version and publish in-app web events"
                  color="bg-[#e2f7ef] text-[#087f74]"
                />
              </div>
            </section>
            <section className="rounded-2xl border border-[#dce8e5] bg-white">
              <div className="flex justify-between border-b border-[#e6eeec] px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold">Recent activity</h3>
                  <p className="mt-0.5 text-[10px] text-[#849590]">
                    Latest platform events
                  </p>
                </div>
                <Link href="/audit-logs" className="text-[10px] font-bold text-[#087f74]">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-[#edf2f1]">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 px-5 py-3.5"
                  >
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-[#38ad9f]" />
                    <div>
                      <p className="text-[11px] font-bold">{log.action.replaceAll("_", " ")}</p>
                      <p className="mt-0.5 text-[10px] text-[#81928e]">
                        {log.description}
                      </p>
                    </div>
                    <span className="ml-auto shrink-0 text-[9px] text-[#98a7a4]">
                      {relativeTime(log.createdAt, now)}
                    </span>
                  </div>
                ))}
                {!recentLogs.length && <p className="px-5 py-10 text-center text-xs text-[#81928e]">No platform activity has been recorded.</p>}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function ManagementLink({ href, title, detail, color }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 p-5 hover:bg-[#f8fbfa]"
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-xl text-lg font-bold ${color}`}
      >
        {title[0]}
      </span>
      <div>
        <p className="text-xs font-bold">{title}</p>
        <p className="mt-1 text-[10px] text-[#81928e]">{detail}</p>
      </div>
      <span className="ml-auto text-[#78908a] transition group-hover:translate-x-1 group-hover:text-[#087f74]">
        →
      </span>
    </Link>
  );
}

function relativeTime(value, now = new Date()) {
  const seconds = Math.max(0, Math.floor((now - value) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
