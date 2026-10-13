import { requirePagePermission } from "@/lib/portal-admin";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import { prisma } from "../../lib/prisma";
import { dashboardData } from "@/lib/dashboard-data";
import { canAccessPage } from "@/lib/portal-permissions";
import DashboardRefresh from "./dashboard-refresh";
import DashboardChart from "./dashboard-chart";

export default async function DashboardHome({ searchParams }) {
  const admin = await requirePagePermission("dashboard.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  const firstName = session.user.name?.split(" ")[0] ?? "Admin";
  const data = await dashboardData(prisma, admin, (await searchParams).days);
  const now = data.generatedAt;
  const recentLogs = data.logs;
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Karachi" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

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
                {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Karachi" })}
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                {greeting}, {firstName}.
              </h2>
              <p className="mt-1.5 text-sm text-[#71847f]">
                Here is what is happening across your platform today.
              </p>
            </div>
            <div className="flex items-center gap-2"><DashboardRefresh />{canAccessPage(admin, "/audit-logs") && <Link href="/audit-logs" className="grid h-10 place-items-center rounded-lg border border-[#d7e4e1] bg-white px-4 text-xs font-semibold text-[#526b67] hover:bg-[#f1f7f5]">
              View audit report
            </Link>}</div>
          </div>
          <p className="mb-4 text-[10px] text-[#81928e]">Updated {now.toISOString().replace("T", " ").slice(0,19)} UTC · Charts use UTC daily totals</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.cards.map(({ label, value, detail, href, urgent }) => (
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
                    {urgent && BigInt(value) > 0n ? "Needs review" : "Live data"}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold">{BigInt(value).toLocaleString("en-US")}</p>
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
            <DashboardChart charts={data.charts} days={data.days} />
            <section className="rounded-2xl bg-linear-to-br from-[#0a3c38] to-[#0b625a] p-6 text-white shadow-[0_12px_32px_rgba(9,73,68,.15)]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#54e2cf] shadow-[0_0_0_5px_rgba(84,226,207,.12)]" />
                <p className="text-xs font-bold">Live network</p>
              </div>
              <p className="mt-2 text-[10px] text-[#88bbb5]">
                Current database presence · refreshes every minute
              </p>
              <div className="mt-8 space-y-5">
                {data.network.map(({ label, value, detail }) => (
                  <div key={label}>
                    <div className="mb-2 flex justify-between text-[11px]">
                      <span className="text-[#a8ceca]">{label}</span>
                      <strong>{value.toLocaleString("en-US")}</strong>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-[#4fdac8]" style={{ width: `${data.network.reduce((sum, n) => sum + n.value, 0) ? value / data.network.reduce((sum, n) => sum + n.value, 0) * 100 : 0}%` }} /></div>
                    <p className="mt-2 text-[10px] text-[#a8ceca]">{detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="mt-6 overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
            <div className="border-b border-[#e6eeec] px-5 py-4"><h3 className="text-sm font-bold">Requires attention</h3><p className="mt-0.5 text-[10px] text-[#849590]">Pending applications, payouts and moderation in your permitted modules</p></div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3">{data.attention.map(item => <div key={item.label} className="flex items-center gap-3 border-b border-[#edf2f1] px-5 py-4"><span className={`rounded-lg px-3 py-2 text-sm font-bold ${item.count ? "bg-amber-50 text-amber-800" : "bg-[#f1f7f5] text-[#71847f]"}`}>{item.count.toLocaleString("en-US")}</span><div><p className="text-xs font-bold">{item.label}</p><p className="mt-1 text-[10px] text-[#81928e]">{item.detail}</p>{canAccessPage(admin,item.href) && <Link href={item.href} className="mt-1 inline-block text-[10px] font-bold text-[#087f74]">Review →</Link>}</div></div>)}</div>
            {!data.attention.length && <p className="px-5 py-6 text-xs text-[#81928e]">No review queues available for your permissions.</p>}
          </section>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
              <div className="border-b border-[#e6eeec] px-5 py-4">
                <h3 className="text-sm font-bold">Management</h3>
                <p className="mt-0.5 text-[10px] text-[#849590]">
                  Quick access to platform records
                </p>
              </div>
              <div className="divide-y divide-[#edf2f1]">
                <ManagementLink admin={admin} href="/room-management" title="Room Management" detail="Audio rooms, members, seats and moderation" color="bg-[#e4f6f3] text-[#087f74]" />
                <ManagementLink admin={admin} href="/live-management" title="Live Management" detail="Video streams, guests, reports and live rewards" color="bg-[#eee9ff] text-[#6953b5]" />
                <ManagementLink admin={admin}
                  href="/users"
                  title="Users / Senders"
                  detail="Users, gifts, devices, bans, levels and history"
                  color="bg-[#e4f6f3] text-[#087f74]"
                />
                <ManagementLink admin={admin}
                  href="/talents"
                  title="Host Management"
                  detail="Video and audio hosts, verification, salary and gifts"
                  color="bg-[#fff3e4] text-[#ad6c20]"
                />
                <ManagementLink admin={admin}
                  href="/agencies"
                  title="Agency Management"
                  detail="Rankings, targets, applications and salaries"
                  color="bg-[#eee9ff] text-[#6953b5]"
                />
                <ManagementLink admin={admin}
                  href="/finance"
                  title="Finance & Wallet"
                  detail="Top-ups, immutable ledger, gift settlements and payout review"
                  color="bg-[#fff1e9] text-[#bd6123]"
                />
                <ManagementLink admin={admin}
                  href="/events-login"
                  title="Events Management"
                  detail="Host, version and publish in-app web events"
                  color="bg-[#e2f7ef] text-[#087f74]"
                />
                <ManagementLink admin={admin}
                  href="/games-management"
                  title="Games Management"
                  detail="Games, probability controls, wagers and payout logs"
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
                {canAccessPage(admin, "/audit-logs") && <Link href="/audit-logs" className="text-[10px] font-bold text-[#087f74]">
                  View all
                </Link>}
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
                {!recentLogs.length && <p className="px-5 py-10 text-center text-xs text-[#81928e]">{canAccessPage(admin, "/audit-logs") ? "No platform activity has been recorded." : "Audit-log permission is required to view activity."}</p>}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function ManagementLink({ admin, href, title, detail, color }) {
  if (!canAccessPage(admin, href)) return null;
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

