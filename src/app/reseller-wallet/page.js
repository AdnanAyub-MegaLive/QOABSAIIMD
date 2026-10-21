import { requirePagePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, ShieldCheck, Wallet } from "lucide-react";
import PortalSidebar from "../components/portal-sidebar";
import Form from "./wallet-form";

export default async function Page({ searchParams }) {
  await requirePagePermission("finance.adjust");
  const params = await searchParams;
  const userId = typeof params.userId === "string" ? params.userId.trim() : "";
  const user = userId ? await prisma.user.findFirst({ where: { publicId: userId, appRoles: { has: "RESELLER" } }, select: { publicId: true, name: true, status: true, deletedAt: true, coinBalance: true, resellerCoinBalance: true } }) : null;
  const active = user?.status === "ACTIVE" && !user.deletedAt;
  return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
    <PortalSidebar />
    <section className="lg:pl-64">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-[#dfe9e7] bg-white px-6 py-4 md:px-10">
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-teal-700">Financial operations</p><h1 className="mt-1 text-lg font-bold">Reseller Business Wallet</h1></div>
        <Link href="/users" className="flex items-center gap-2 rounded-lg border border-[#d7e4e1] px-4 py-2 text-xs font-semibold hover:bg-teal-50"><ArrowLeft size={14}/>Back to users</Link>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 p-5 md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold tracking-tight md:text-3xl">Business funds. Separate by design.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#637b75]">Fund a reseller’s recharge balance without touching their personal Coins.</p></div><span className="flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800"><ShieldCheck size={15}/>Admin-controlled funding</span></div>
        <section className="rounded-2xl border border-[#dce8e5] bg-white p-5 shadow-sm md:p-6" aria-label="Find reseller">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" action="/reseller-wallet">
            <div className="flex-1"><label htmlFor="reseller-id" className="text-xs font-bold">Reseller public ID</label><div className="relative mt-2"><Search size={18} className="pointer-events-none absolute left-3 top-3 text-[#718580]"/><input id="reseller-id" name="userId" defaultValue={userId} placeholder="Enter public ID, e.g. USR-2030140" required maxLength={100} className="w-full rounded-xl border border-[#d7e4e1] bg-[#f8fbfa] py-3 pl-10 pr-4 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"/></div></div>
            <button className="flex items-center justify-center gap-2 rounded-xl bg-[#087f74] px-6 py-3 text-sm font-bold text-white hover:bg-teal-800">Find reseller<ArrowRight size={16}/></button>
          </form>
        </section>
        {user ? <>
          <div className="flex flex-wrap items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-lg font-bold text-teal-800">{user.name?.slice(0,1).toUpperCase() || "R"}</div><div><h3 className="font-bold">{user.name}</h3><Link href={`/users/${encodeURIComponent(user.publicId)}`} className="text-xs text-teal-700 underline underline-offset-4">{user.publicId} · View profile</Link></div><span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{active ? "Active reseller" : "Funding unavailable"}</span></div>
          <Form key={user.publicId} userId={user.publicId} business={String(user.resellerCoinBalance)} personal={String(user.coinBalance)} disabled={!active}/>
        </> : <section className="rounded-2xl border border-dashed border-[#bfd5cf] bg-white px-6 py-14 text-center"><Wallet size={32} className="mx-auto mb-4 text-teal-600"/><h3 className="text-lg font-bold">{userId ? "No reseller found" : "Choose a reseller to get started"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#637b75]">{userId ? "Check the public ID and confirm the account has the Reseller role." : "Search by public ID to view both balances and add funds to the business wallet."}</p></section>}
      </div>
    </section>
  </main>;
}
