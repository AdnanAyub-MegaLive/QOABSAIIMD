import Link from "next/link";
import PortalSidebar from "../components/portal-sidebar";
import { requirePagePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { regionReport } from "@/lib/region-report";

export const dynamic = "force-dynamic";
const cols = [["total", "Users"], ["joined", "New sign-ups"], ["hosts", "Hosts"], ["inAgency", "In agencies"], ["vip", "VIP"],
  ["gifts", "Gifts sent"], ["giftCoins", "Coins gifted"], ["receivedCoins", "Gift value received"], ["topUpCoins", "Coins topped up"], ["payers", "Paying users"],
  ["banned", "Banned"], ["frozen", "Wallets frozen"]];
const fmt = n => new Intl.NumberFormat("en-US").format(n);

export default async function RegionReportPage({ searchParams }) {
  const admin = await requirePagePermission("region.view");
  const report = await regionReport(prisma, admin, { days: (await searchParams).days });
  const all = [...report.rows, report.totals];
  return (
    <div className="portal-ui flex min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <main className="flex-1 space-y-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-bold">My Region</h1><p className="text-sm text-[#71847f]">Work totals for {admin.allowedCountries?.length ? admin.allowedCountries.join(", ") : "all regions"} · last {report.days} day{report.days > 1 ? "s" : ""} (user counts are current totals).</p></div>
          <nav className="flex gap-2">{[1, 7, 30, 90].map(d => <Link key={d} href={`/region-report?days=${d}`} className={`rounded-full border px-3 py-1 text-sm ${d === report.days ? "border-[#0f766e] bg-[#e6f4f1] font-semibold" : "border-[#dce8e5] bg-white"}`}>{d === 1 ? "Today" : `${d} days`}</Link>)}
            <a href={`/api/admin/region-report?days=${report.days}&format=csv`} className="rounded-full border border-[#dce8e5] bg-white px-3 py-1 text-sm">Export CSV</a></nav>
        </header>
        <section className="grid gap-4 md:grid-cols-4">{[["Users", report.totals.total], ["New sign-ups", report.totals.joined], ["Coins gifted", report.totals.giftCoins], ["Coins topped up", report.totals.topUpCoins]].map(([l, v]) =>
          <div key={l} className="rounded-2xl border border-[#dce8e5] bg-white p-5"><p className="text-xs uppercase text-[#71847f]">{l}</p><p className="mt-2 text-2xl font-bold">{fmt(v)}</p></div>)}</section>
        <div className="overflow-x-auto rounded-2xl border border-[#dce8e5] bg-white"><table className="w-full text-left text-sm"><thead className="bg-[#edf5f2] text-xs uppercase text-[#71847f]"><tr><th className="p-3">Country</th>{cols.map(([, l]) => <th key={l} className="p-3 text-right">{l}</th>)}</tr></thead>
          <tbody>{all.map(r => <tr key={r.country} className={`border-t border-[#edf2f0] ${r === report.totals ? "bg-[#f7fbfa] font-semibold" : ""}`}><td className="p-3">{r.country}</td>{cols.map(([k]) => <td key={k} className="p-3 text-right tabular-nums">{fmt(r[k])}</td>)}</tr>)}</tbody></table></div>
        <p className="text-xs text-[#71847f]">Gift value is in coins. Reversed gifts are excluded. Only users whose profile country is one of your regions are counted.</p>
      </main>
    </div>
  );
}
