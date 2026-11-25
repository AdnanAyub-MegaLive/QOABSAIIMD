import { Prisma } from "@prisma/client";
import { REGION_COUNTRIES } from "./staff-regions.js";
import { countryLabel } from "./staff-scope.js";

const num = v => Number(v ?? 0);
/** Totals per assigned country for the period [from, to). */
export async function regionReport(db, admin, { days = 30 } = {}) {
  const span = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const to = new Date(), from = new Date(to.getTime() - span * 86400000);
  const names = admin.role === "SUPER_ADMIN" || !admin.allowedCountries?.length ? Object.keys(REGION_COUNTRIES) : admin.allowedCountries;
  const values = [...new Set(names.flatMap(n => [n, n.toUpperCase(), n.toLowerCase(), ...(REGION_COUNTRIES[n] ?? [])]))];
  const list = Prisma.join(values);
  const [users, gifts, received, topups] = await Promise.all([
    db.$queryRaw`SELECT country,
        count(*) FILTER (WHERE "deletedAt" IS NULL) AS total,
        count(*) FILTER (WHERE "createdAt" >= ${from}) AS joined,
        count(*) FILTER (WHERE status = 'BANNED') AS banned,
        count(*) FILTER (WHERE "walletFrozen") AS frozen,
        count(*) FILTER (WHERE 'HOST' = ANY("appRoles")) AS hosts,
        count(*) FILTER (WHERE "agencyId" IS NOT NULL) AS "inAgency",
        count(*) FILTER (WHERE "vipLevel" > 0) AS vip
      FROM "User" WHERE country IN (${list}) GROUP BY country`,
    db.$queryRaw`SELECT u.country, count(*) AS gifts, coalesce(sum(g."coinValue" * g.quantity), 0) AS coins, count(DISTINCT g."senderId") AS senders
      FROM "GiftTransaction" g JOIN "User" u ON u.id = g."senderId"
      WHERE g."createdAt" >= ${from} AND g."reversedAt" IS NULL AND u.country IN (${list}) GROUP BY u.country`,
    db.$queryRaw`SELECT u.country, coalesce(sum(g."coinValue" * g.quantity), 0) AS coins, count(DISTINCT g."recipientUserId") AS receivers
      FROM "GiftTransaction" g JOIN "User" u ON u.id = g."recipientUserId"
      WHERE g."createdAt" >= ${from} AND g."reversedAt" IS NULL AND u.country IN (${list}) GROUP BY u.country`,
    db.$queryRaw`SELECT u.country, coalesce(sum(w.coins), 0) AS coins, count(DISTINCT w."userId") AS payers
      FROM "WalletTransaction" w JOIN "User" u ON u.id = w."userId"
      WHERE w.type = 'COIN_TOP_UP' AND w.direction = 'CREDIT' AND w.status = 'COMPLETED' AND w."createdAt" >= ${from} AND u.country IN (${list}) GROUP BY u.country`,
  ]);
  const rows = Object.fromEntries(names.map(name => [name, { country: name, total: 0, joined: 0, banned: 0, frozen: 0, hosts: 0, inAgency: 0, vip: 0, gifts: 0, giftCoins: 0, senders: 0, receivedCoins: 0, receivers: 0, topUpCoins: 0, payers: 0 }]));
  const add = (country, patch) => { const r = rows[countryLabel(country)]; if (r) for (const [k, v] of Object.entries(patch)) r[k] += num(v); };
  users.forEach(u => add(u.country, { total: u.total, joined: u.joined, banned: u.banned, frozen: u.frozen, hosts: u.hosts, inAgency: u.inAgency, vip: u.vip }));
  gifts.forEach(g => add(g.country, { gifts: g.gifts, giftCoins: g.coins, senders: g.senders }));
  received.forEach(g => add(g.country, { receivedCoins: g.coins, receivers: g.receivers }));
  topups.forEach(t => add(t.country, { topUpCoins: t.coins, payers: t.payers }));
  const list2 = Object.values(rows);
  const totals = list2.reduce((t, r) => { for (const k of Object.keys(r)) if (k !== "country") t[k] = (t[k] ?? 0) + r[k]; return t; }, { country: "All regions" });
  return { days: span, from, to, rows: list2, totals };
}
