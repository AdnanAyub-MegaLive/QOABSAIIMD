import { Prisma } from "@prisma/client";
import { walletHistoryPredicate } from "./wallet-history-search.js";
import { serializeWithdrawal } from "./wallet.js";
import { currencyRequestDto } from "./currency-operations.js";

export async function withdrawalHistory(db, userId, params) {
  const query = String(params.get("q") ?? "").trim();
  const limit = Number(params.get("limit") ?? 20);
  const invalid = () => Object.assign(new Error("Invalid withdrawal history page."), { code: "VALIDATION_ERROR" });
  if (query.length > 120 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw invalid();
  let boundary = Prisma.empty;
  const cursor = params.get("cursor");
  if (cursor) {
    try {
      if (cursor.length > 2048) throw invalid();
      const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
      const time = new Date(value.time);
      if (value.query !== query || value.user !== userId || !["currency", "legacy"].includes(value.source) || typeof value.id !== "string" || !value.id || !Number.isFinite(time.getTime())) throw invalid();
      boundary = Prisma.sql`WHERE (records."createdAt", records.source, records.id) < (${time.toISOString()}::timestamp, ${value.source}, ${value.id})`;
    } catch { throw invalid(); }
  }
  const rows = await db.$queryRaw(Prisma.sql`SELECT records.*, to_char(records."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "cursorTime" FROM (
    SELECT h.id, h."createdAt", 'legacy'::text AS source FROM "WalletWithdrawal" h
      WHERE h."userId"=${userId} AND ${walletHistoryPredicate("withdrawals", query)}
    UNION ALL
    SELECT h.id, h."createdAt", 'currency'::text AS source FROM "CurrencyRequest" h
      WHERE h."userId"=${userId} AND h.kind='USDT' AND ${walletHistoryPredicate("currency", query)}
    ) records ${boundary} ORDER BY "createdAt" DESC, source DESC, id DESC LIMIT ${limit + 1}`);
  const page = rows.slice(0, limit);
  const [legacy, currency] = await Promise.all([
    db.walletWithdrawal.findMany({ where: { userId, id: { in: page.filter(row => row.source === "legacy").map(row => row.id) } } }),
    db.currencyRequest.findMany({ where: { userId, kind: "USDT", id: { in: page.filter(row => row.source === "currency").map(row => row.id) } } }),
  ]);
  const byId = new Map([
    ...legacy.map(row => [`legacy:${row.id}`, { ...serializeWithdrawal(row), historySource: "legacy" }]),
    ...currency.map(row => [`currency:${row.id}`, { ...currencyRequestDto(row), historySource: "currency" }]),
  ]);
  const last = page.at(-1);
  return { items: page.map(row => byId.get(`${row.source}:${row.id}`)).filter(Boolean), nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ user: userId, query, time: `${last.cursorTime}Z`, source: last.source, id: last.id })).toString("base64url") : null };
}
