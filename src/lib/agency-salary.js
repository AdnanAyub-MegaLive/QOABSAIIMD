import { agencyWorkReports } from "./agency-work.js";
import { hostReportAliases } from "./host-report-identity.js";
import { prisma } from "./prisma.js";
import { activityProgress } from "./activity-levels.js";
import { validationError } from "./wallet.js";

export function salaryMonth(value, now = new Date()) {
  const month = value || now.toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "2000-01" || month > now.toISOString().slice(0, 7)) throw validationError("Choose a valid month from 2000-01 through the current month.");
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { month, start, end };
}

export function sessionAttendance(sessions, start, end, now = new Date()) {
  const intervals = sessions.map(s => [Math.max(+new Date(s.startedAt), +start), Math.min(+(s.endedAt ? new Date(s.endedAt) : now), +end, +now)])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of intervals) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const days = new Set(); let ms = 0;
  for (const [a, b] of merged) {
    ms += b - a;
    for (let day = Math.floor(a / 86400000); day <= Math.floor((b - 1) / 86400000); day++) days.add(day);
  }
  return { liveMinutes: Math.floor(ms / 60000), activeDays: days.size };
}

export async function getAgencySalary(agencyId, selectedMonth, db = prisma, origin = null) {
  const now = new Date();
  const { month, start, end } = salaryMonth(selectedMonth, now);
  const agency = await db.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { id: true, publicId: true, name: true, monthlyTargetCoins: true, userHosts: { select: { id: true, publicId: true, name: true, profileImage: true } }, talents: { select: { id: true, publicId: true, displayName: true, profileImage: true } } } });
  const [settlements, bills, recharge] = await Promise.all([
    db.giftSettlement.findMany({ where: { agencyId, giftTransaction: { reversedAt: null }, createdAt: { gte: start, lt: end } }, select: { grossCoins: true, hostSalaryCoins: true, agencyCoins: true, giftTransaction: { select: { recipientUser: { select: { id: true, publicId: true, name: true, profileImage: true } }, talent: { select: { id: true, publicId: true, displayName: true, profileImage: true } } } } } }),
    db.$queryRaw`SELECT to_char(s."createdAt", 'YYYY-MM') AS month, SUM(s."hostSalaryCoins") AS salary, SUM(s."agencyCoins") AS commission FROM "GiftSettlement" s JOIN "GiftTransaction" g ON g.id = s."giftTransactionId" WHERE s."agencyId" = ${agencyId} AND g."reversedAt" IS NULL GROUP BY 1 ORDER BY 1 DESC`,
    db.user.aggregate({ where: { agencyId }, _sum: { totalTopUp: true } }),
  ]);
  const talents = [...agency.talents, ...settlements.map(s => s.giftTransaction.talent).filter(Boolean)];
  const linkedUsers = talents.length ? await db.user.findMany({ where: { publicId: { in: [...new Set(talents.map(t => t.publicId))] } }, select: { id: true, publicId: true, name: true, profileImage: true } }) : [];
  const aliases = hostReportAliases([...agency.userHosts, ...linkedUsers], talents);
  const hosts = new Map();
  function ensure(person, kind) {
    if (kind === "TALENT" && aliases.has(person.id)) { person = aliases.get(person.id); kind = "USER"; }
    const key = `${kind}:${person.id}`;
    if (!hosts.has(key)) hosts.set(key, { internalId: person.id, kind, publicId: person.publicId, name: person.name ?? person.displayName, profileImage: person.profileImage, giftIncomeCoins: 0n, salaryCoins: 0n, commissionCoins: 0n });
    return hosts.get(key);
  }
  agency.userHosts.forEach(u => ensure(u, "USER"));
  agency.talents.forEach(t => ensure(t, "TALENT"));
  for (const row of settlements) {
    const person = row.giftTransaction.recipientUser ?? row.giftTransaction.talent;
    if (!person) continue;
    const host = ensure(person, row.giftTransaction.recipientUser ? "USER" : "TALENT");
    host.giftIncomeCoins += row.grossCoins; host.salaryCoins += row.hostSalaryCoins; host.commissionCoins += row.agencyCoins;
  }
  const overlap = { startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] };
  const [videos, talentSessions] = await Promise.all([
    db.videoLiveSession.findMany({ where: { hostId: { in: [...hosts.values()].filter(h => h.kind === "USER").map(h => h.internalId) }, ...overlap }, select: { hostId: true, startedAt: true, endedAt: true } }),
    db.liveSession.findMany({ where: { talentId: { in: [...new Set(talents.map(t => t.id))] }, ...overlap }, select: { talentId: true, startedAt: true, endedAt: true } }),
  ]);
  const rows = [...hosts.values()].sort((a, b) => a.salaryCoins === b.salaryCoins ? a.publicId.localeCompare(b.publicId) : a.salaryCoins > b.salaryCoins ? -1 : 1).map(h => ({
    publicId: h.publicId, name: h.name, profileImage: h.profileImage, kind: h.kind,
    giftIncomeCoins: h.giftIncomeCoins.toString(), salaryCoins: h.salaryCoins.toString(), commissionCoins: h.commissionCoins.toString(),
    ...sessionAttendance([...videos.filter(s => h.kind === "USER" && s.hostId === h.internalId), ...talentSessions.filter(s => h.kind === "TALENT" ? s.talentId === h.internalId : aliases.get(s.talentId)?.id === h.internalId)], start, end, now),
    activityCoverage: "RECORDED_VIDEO_AND_LEGACY_LIVE_SESSIONS",
  }));
  const months = bills.map(b => ({ month: b.month, totalSalaryCoins: String(b.salary ?? 0n), commissionCoins: String(b.commission ?? 0n), status: b.month === now.toISOString().slice(0, 7) ? "ACCRUING" : "ACCRUED" }));
  if (!months.some(b => b.month === month)) months.push({ month, totalSalaryCoins: "0", commissionCoins: "0", status: month === now.toISOString().slice(0, 7) ? "ACCRUING" : "ACCRUED" });
  months.sort((a, b) => b.month.localeCompare(a.month));
  const bill = months.find(b => b.month === month);
  const [report] = await agencyWorkReports(db, [{ id: agencyId }], { month, start, end }, aliases);
  for (const host of rows) {
    const source = [...hosts.values()].find(h => h.publicId === host.publicId && h.kind === host.kind);
    const work = report.work.hosts.find(h => h.key === `${host.kind}:${source.internalId}`);
    Object.assign(host, { giftDiamonds: work?.diamonds ?? "0", agencySalaryDiamonds: work?.salaryDiamonds ?? "0", achievedTargetDiamonds: work?.targetDiamonds ?? null, commissionBps: work?.commissionBps ?? 0, unvaluedGiftCount: work?.unvaluedGiftCount ?? 0 });
  }
  rows.sort((a,b) => BigInt(a.giftDiamonds) === BigInt(b.giftDiamonds) ? a.publicId.localeCompare(b.publicId) : BigInt(a.giftDiamonds) > BigInt(b.giftDiamonds) ? -1 : 1);
  return { work: report.work, agencyId: agency.publicId, agencyName: agency.name, month, timezone: "UTC", ...bill, giftIncomeCoins: settlements.reduce((sum, s) => sum + s.grossCoins, 0n).toString(), totalRechargeCoins: String(recharge._sum.totalTopUp ?? 0n), rechargeBasis: "CURRENT_HOSTS_LIFETIME", ...await activityProgress("AGENCY",agency.id,origin,db).then(p=>({agencyLevel:p.level,nextLevelThreshold:p.nextThreshold,progression:p})), monthlyTargetCoins: agency.monthlyTargetCoins.toString(), hosts: rows, topEarners: rows.slice(0, 3), months, reportingBasis: { earnings: "RECORDED_RECIPIENT_DIAMONDS", coinFields: "LEGACY_SETTLEMENT_ACCOUNTING_NOT_WITHDRAWABLE_BALANCE", salary: "MONTHLY_POLICY_ESTIMATE_NOT_UNPAID_BILL", topEarners: "GIFT_DIAMONDS" }, activityNotice: "Attendance combines recorded video and exactly linked legacy live sessions. Missing historical audio attendance cannot be reconstructed. Accrued salary is earnings, not an unpaid payout bill." };
}
