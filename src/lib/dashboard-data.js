import { hasPermission } from "./portal-permissions.js";
export function dashboardRange(value, now = new Date()) {
  const days = String(value) === "30" ? 30 : 7;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { days, today, start: new Date(today.getTime() - (days - 1) * 86400000) };
}
export function dailySeries(rows, start, days) {
  const values = new Map(rows.map(row => [row.day, String(row.value)]));
  return Array.from({ length: days }, (_, i) => { const day = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10); return { day, value: values.get(day) ?? "0" }; });
}
export async function dashboardData(db, admin, period, now = new Date()) {
  const range = dashboardRange(period, now), can = p => hasPermission(admin, p);
  const cards = [], attention = [], charts = [], network = [];
  const card = (label, value, detail, href, urgent = false) => cards.push({ label, value: String(value), detail, href, urgent });
  await Promise.all([
    can("users.view") && (async () => {
      const [total, rows] = await Promise.all([db.user.count({ where: { deletedAt: null } }), db.$queryRaw`SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, count(*)::bigint AS value FROM "User" WHERE "createdAt" >= ${range.start} AND "createdAt" <= ${now} AND "deletedAt" IS NULL GROUP BY 1 ORDER BY 1`]);
      card("Registered users", total, "Excludes deleted accounts", "/users");
      charts.push({ title: "New accounts", unit: "users", detail: "Signups by creation date · excludes deleted accounts", points: dailySeries(rows, range.start, range.days) });
    })(),
    can("hosts.view") && (async () => {
      card("Active hosts", await db.user.count({ where: { deletedAt: null, status: "ACTIVE", agencyId: { not: null }, appRoles: { has: "HOST" } } }), "Unique agency-linked host accounts", "/talents");
    })(),
    can("agencies.view") && (async () => {
      const [count, pending] = await Promise.all([db.agency.count({ where: { status: "ACTIVE" } }), db.agencyApplication.count({ where: { status: "PENDING" } })]);
      card("Active agencies", count, `${pending} applications awaiting review`, "/agencies");
      attention.push({ label: "Agency applications", count: pending, href: "/agencies", detail: "Pending approval or rejection" });
    })(),
    can("finance.view") && (async () => {
      const [gifts, legacy, pending, approved, rows] = await Promise.all([
        db.giftTransaction.aggregate({ where: { createdAt: { gte: range.today }, reversedAt: null }, _sum: { coinValue: true } }),
        db.walletWithdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
        db.currencyRequest.count({ where: { status: "PENDING" } }),
        db.currencyRequest.count({ where: { status: "APPROVED", kind: "USDT" } }),
        db.$queryRaw`SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, sum("coinValue") AS value FROM "GiftTransaction" WHERE "createdAt" >= ${range.start} AND "createdAt" <= ${now} AND "reversedAt" IS NULL GROUP BY 1 ORDER BY 1`,
      ]);
      card("Gift Coins today", gifts._sum.coinValue ?? 0n, "Gift value, not platform profit · UTC", "/finance");
      card("Finance action queue", legacy + pending + approved, `${pending} reviews · ${approved} approved USDT · ${legacy} legacy`, "/finance", true);
      attention.push({ label: "Currency requests", count: pending, href: "/platform-rules?tab=exchange", detail: "Requests awaiting review · Currency rules → Review Queue" }, { label: "Approved USDT payouts", count: approved, href: "/platform-rules?tab=exchange", detail: "Approved but not yet marked paid · Currency rules → Review Queue" });
      charts.push({ title: "Gift activity", unit: "Coins", detail: "Audio + video · reversed gifts excluded · not revenue", points: dailySeries(rows, range.start, range.days) });
    })(),
    can("rooms.view") && (async () => {
      const live = { status: "LIVE", isBlocked: false, owner: { status: "ACTIVE", deletedAt: null } };
      const [rooms, members] = await Promise.all([db.audioRoom.count({ where: live }), db.audioRoomMember.count({ where: { socketCount: { gt: 0 }, audioRoom: live, user: { status: "ACTIVE", deletedAt: null } } })]);
      card("Live audio rooms", rooms, `${members} connected room memberships`, "/room-management");
      network.push({ label: "Audio rooms", value: rooms, detail: `${members} connected memberships (includes hosts)`, href: "/room-management" });
    })(),
    can("video.view") && (async () => {
      const cutoff = new Date(now.getTime() - 90000), live = { status: "LIVE", hostLastSeenAt: { gte: cutoff }, host: { status: "ACTIVE", deletedAt: null } };
      const [count, viewers, stale, reports, rows] = await Promise.all([
        db.videoLiveSession.count({ where: live }),
        db.videoLiveViewer.count({ where: { session: live, active: true, user: { status: "ACTIVE", deletedAt: null }, OR: [{ socketCount: { gt: 0 } }, { lastSeenAt: { gte: cutoff } }] } }),
        db.videoLiveSession.count({ where: { status: "LIVE", hostLastSeenAt: { lt: cutoff } } }),
        db.videoLiveReport.count({ where: { status: "OPEN" } }),
        db.$queryRaw`SELECT to_char("startedAt", 'YYYY-MM-DD') AS day, count(*)::bigint AS value FROM "VideoLiveSession" WHERE "startedAt" >= ${range.start} AND "startedAt" <= ${now} GROUP BY 1 ORDER BY 1`,
      ]);
      card("Live video streams", count, `${viewers} current viewer memberships`, "/live-management");
      network.push({ label: "Video streams", value: count, detail: `${viewers} active viewer memberships · not peak viewers`, href: "/live-management" });
      attention.push({ label: "Live reports", count: reports, detail: "Open viewer moderation reports", href: "/live-management" }, { label: "Stale live sessions", count: stale, detail: "No host heartbeat for 90 seconds; excluded from live count", href: "/live-management" });
      charts.push({ title: "Video sessions started", unit: "sessions", detail: "Actual session records, including ended sessions", points: dailySeries(rows, range.start, range.days) });
    })(),
  ]);
  const logs = can("audit.view") ? await db.auditLog.findMany({ select: { id: true, action: true, description: true, createdAt: true, admin: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 6 }) : [];
  const order = ["Active agencies", "Finance action queue", "Registered users", "Active hosts", "Live audio rooms", "Live video streams", "Gift Coins today"];
  cards.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  charts.sort((a, b) => a.title.localeCompare(b.title)); network.sort((a, b) => a.label.localeCompare(b.label));
  return { ...range, generatedAt: now, cards, attention: attention.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)), charts, network, logs };
}
