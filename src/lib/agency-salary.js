import { prisma } from "./prisma.js";
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

export async function getAgencySalary(agencyId, selectedMonth, db = prisma) {
  const now = new Date();
  const { month, start, end } = salaryMonth(selectedMonth, now);
  const agency = await db.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { publicId: true, name: true, monthlyTargetCoins: true, userHosts: { select: { id: true, publicId: true, name: true, profileImage: true } }, talents: { select: { id: true, publicId: true, displayName: true, profileImage: true } } } });
  const [settlements, bills, recharge] = await Promise.all([
    db.giftSettlement.findMany({ where: { agencyId, createdAt: { gte: start, lt: end } }, select: { grossCoins: true, hostSalaryCoins: true, agencyCoins: true, giftTransaction: { select: { recipientUser: { select: { id: true, publicId: true, name: true, profileImage: true } }, talent: { select: { id: true, publicId: true, displayName: true, profileImage: true } } } } } }),
    db.$queryRaw`SELECT to_char("createdAt", 'YYYY-MM') AS month, SUM("hostSalaryCoins") AS salary, SUM("agencyCoins") AS commission FROM "GiftSettlement" WHERE "agencyId" = ${agencyId} GROUP BY 1 ORDER BY 1 DESC`,
    db.user.aggregate({ where: { agencyId }, _sum: { totalTopUp: true } }),
  ]);
  const hosts = new Map();
  function ensure(person, kind) {
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
    db.liveSession.findMany({ where: { talentId: { in: [...hosts.values()].filter(h => h.kind === "TALENT").map(h => h.internalId) }, ...overlap }, select: { talentId: true, startedAt: true, endedAt: true } }),
  ]);
  const rows = [...hosts.values()].sort((a, b) => a.salaryCoins === b.salaryCoins ? a.publicId.localeCompare(b.publicId) : a.salaryCoins > b.salaryCoins ? -1 : 1).map(h => ({
    publicId: h.publicId, name: h.name, profileImage: h.profileImage, kind: h.kind,
    giftIncomeCoins: h.giftIncomeCoins.toString(), salaryCoins: h.salaryCoins.toString(), commissionCoins: h.commissionCoins.toString(),
    ...sessionAttendance(h.kind === "USER" ? videos.filter(s => s.hostId === h.internalId) : talentSessions.filter(s => s.talentId === h.internalId), start, end, now),
    activityCoverage: h.kind === "USER" ? "VIDEO_SESSIONS_ONLY" : "RECORDED_LIVE_SESSIONS",
  }));
  const months = bills.map(b => ({ month: b.month, totalSalaryCoins: String(b.salary ?? 0n), commissionCoins: String(b.commission ?? 0n), status: b.month === now.toISOString().slice(0, 7) ? "ACCRUING" : "ACCRUED" }));
  if (!months.some(b => b.month === month)) months.push({ month, totalSalaryCoins: "0", commissionCoins: "0", status: month === now.toISOString().slice(0, 7) ? "ACCRUING" : "ACCRUED" });
  months.sort((a, b) => b.month.localeCompare(a.month));
  const bill = months.find(b => b.month === month);
  return { agencyId: agency.publicId, agencyName: agency.name, month, timezone: "UTC", ...bill, giftIncomeCoins: settlements.reduce((sum, s) => sum + s.grossCoins, 0n).toString(), totalRechargeCoins: String(recharge._sum.totalTopUp ?? 0n), rechargeBasis: "CURRENT_HOSTS_LIFETIME", agencyLevel: null, nextLevelThreshold: null, monthlyTargetCoins: agency.monthlyTargetCoins.toString(), hosts: rows, topEarners: rows.slice(0, 3), months, activityNotice: "User-host attendance covers recorded video sessions only. Historical audio attendance is not available. Accrued salary is earnings, not an unpaid payout bill." };
}
