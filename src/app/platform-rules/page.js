import Link from "next/link";
import { requirePagePermission } from "@/lib/portal-admin";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../lib/prisma";
import { getProfitSplitRule, percentFromBps } from "../../lib/profit-rules";
import PortalSidebar from "../components/portal-sidebar";
import FeatureSearch from "../components/feature-search";
import RulesManager from "./rules-manager";
import ProgressionSettings from "./progression-settings";
import { currentConfiguration, jsonSafe } from "@/lib/progression";
import TeamSettings from "./team-settings";
import CurrencySettings from "./currency-settings";
import { currencyPolicy } from "@/lib/currency-policy";
import { serializeCurrencyRequest } from "@/lib/currency-operations";

import { hasPermission } from "@/lib/portal-permissions";

export default async function PlatformRulesPage({ searchParams }) {
  const requested = (await searchParams).tab;
  const tab = ["progression","hierarchy","exchange","agencies"].includes(requested) ? requested : "settlement";
  const admin = await requirePagePermission("rules.view");
  const currency = await currencyPolicy(prisma);
  const currencyRequests = hasPermission(admin,"finance.withdrawals") ? await prisma.currencyRequest.findMany({take:50,orderBy:{createdAt:"desc"},include:{user:{select:{name:true,publicId:true}}}}) : [];
  const progression = await currentConfiguration();
  const teamPolicy = await prisma.teamPolicy.findUnique({ where: { id: "GLOBAL" } });
  const limits = await prisma.roleTeamLimit.findMany({ orderBy: [{ supervisorRole: "asc" }, { memberRole: "asc" }] });
  const session = await auth();
  if (!session?.user) redirect("/");
  const [rule, agencies, talents, userCandidates, totals] = await Promise.all([
    getProfitSplitRule(),
    prisma.agency.findMany({ where: { status: "ACTIVE" }, include: { _count: { select: { talents: true, userHosts: true } } }, orderBy: { name: "asc" } }),
    prisma.talent.findMany({ select: { publicId: true, displayName: true, agency: { select: { name: true } } }, orderBy: { displayName: "asc" } }),
    prisma.user.findMany({ where: { deletedAt: null, OR: [{ role: "HOST" }, { agencyId: { not: null } }] }, select: { publicId: true, name: true, agency: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.giftSettlement.aggregate({ where: { giftTransaction: { liveSessionId: null } }, _sum: { grossCoins: true, hostSalaryCoins: true, agencyCoins: true, companyCoins: true, reusableCoins: true }, _count: true }),
  ]);
  const agencyData = agencies.map((agency)=>({id:agency.publicId,name:agency.name,hosts:agency._count.talents+agency._count.userHosts,balance:agency.commissionCoinBalance.toString()}));
  const hosts = [...talents.map((item)=>({kind:"TALENT",id:item.publicId,name:item.displayName,agencyName:item.agency.name})),...userCandidates.map((item)=>({kind:"USER",id:item.publicId,name:item.name,agencyName:item.agency?.name??null}))];
  const ruleData = {hostPercent:percentFromBps(rule.hostShareBps),agencyPercent:percentFromBps(rule.agencyShareBps),companyPercent:percentFromBps(rule.companyShareBps),normalUserReusablePercent:percentFromBps(rule.normalUserReusableShareBps),version:rule.version};
  const metrics = [["Settled gifts",totals._count.toLocaleString()],["Gross coins",String(totals._sum.grossCoins??0n)],["Host salary",String(totals._sum.hostSalaryCoins??0n)],["Agency commission",String(totals._sum.agencyCoins??0n)],["Company share",String(totals._sum.companyCoins??0n)],["Reusable coins",String(totals._sum.reusableCoins??0n)]];
  return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar/><section className="lg:pl-64"><header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10"><div><p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">Platform policy</p><h1 className="text-xl font-bold">Rules & Profit Split</h1></div><FeatureSearch/></header><div className="mx-auto max-w-7xl p-6 md:p-10"><nav aria-label="Platform rules sections" className="mb-6 flex gap-2 overflow-x-auto border-b border-[#dce8e5]">{[["settlement","Profit Split & Hosts"],["progression","Account Levels"],["hierarchy","Management Hierarchy"],["exchange","Currency & Salary"],["agencies","Agencies"]].map(([key,label])=><Link key={key} href={`/platform-rules?tab=${key}`} aria-current={tab===key?"page":undefined} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm ${tab===key?"border-[#16877d] text-[#16877d]":"border-transparent text-[#71847f]"}`}>{label}</Link>)}</nav><div className="mb-7"><h2 className="text-2xl font-bold">Financial and host rules</h2><p className="mt-1.5 text-sm text-[#71847f]">Control host eligibility, agency membership, and gift settlement percentages.</p></div><div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{metrics.map(([label,value])=><div key={label} className="rounded-xl border border-[#dfe9e7] bg-white p-4"><p className="text-[10px] font-bold text-[#71847f] uppercase">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>)}</div>{tab==="progression"&&<ProgressionSettings initial={jsonSafe({version:progression.version,enabled:progression.enabled,rules:progression.rules,levels:progression.levels.map(({track,level,thresholdPoints,badgeAssetId,benefits})=>({track,level,thresholdPoints,badgeAssetId,benefits}))})} canManage={hasPermission(admin,"rules.manage")}/>}{tab==="hierarchy"&&<TeamSettings initial={{ limitScope: teamPolicy?.limitScope ?? "DIRECT", allowAncestorRemoval: teamPolicy?.allowAncestorRemoval ?? false, limits }} canManage={hasPermission(admin, "rules.manage")}/>}{tab==="exchange"&&<CurrencySettings initial={currency.rules} version={currency.version} requests={currencyRequests.map(serializeCurrencyRequest)} canManage={hasPermission(admin,"rules.manage")} canReview={hasPermission(admin,"finance.withdrawals")}/>}{tab==="settlement"&&<RulesManager rule={ruleData} agencies={agencyData} hosts={hosts}/>}{tab==="agencies"&&<div className="mt-6 rounded-2xl border border-[#dce8e5] bg-white"><div className="border-b p-5"><h3 className="font-bold">Active agencies</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#f7faf9] text-[#71847f]"><tr><th className="px-5 py-3">Agency</th><th className="px-5 py-3">ID</th><th className="px-5 py-3">Hosts</th><th className="px-5 py-3">Commission balance</th></tr></thead><tbody>{agencyData.map((agency)=><tr key={agency.id} className="border-t"><td className="px-5 py-4 font-bold">{agency.name}</td><td className="px-5 py-4 font-mono">{agency.id}</td><td className="px-5 py-4">{agency.hosts}</td><td className="px-5 py-4 font-semibold">{agency.balance} coins</td></tr>)}</tbody></table></div></div>}</div></section></main>;
}
