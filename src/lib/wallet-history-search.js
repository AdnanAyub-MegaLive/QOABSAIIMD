import { Prisma } from "@prisma/client";

const histories = {
  transactions: { table: '"WalletTransaction"', fields: ["publicId", "referenceId", "title", "description", "type", "status", "coins", "diamonds", "cashAmount"], cursor: "publicId" },
  withdrawals: { table: '"WalletWithdrawal"', fields: ["publicId", "method", "currency", "accountName", "status", "coins", "cashAmount"], cursor: "publicId" },
  currency: { table: '"CurrencyRequest"', fields: ["id", "kind", "status", "recipientPublicId", "diamonds", "quotedCoins", "netUsdtMicros"], cursor: "id" },
};

export async function walletHistorySearch(db, kind, input, user, cursor = null, limit = 50, requestKind = null, category = "ALL") {
  const query = String(input ?? "").trim();
  if (!query) return {};
  if (query.length > 120) throw Object.assign(new Error("Search cannot exceed 120 characters."), { code: "VALIDATION_ERROR" });
  const history = histories[kind];
  if (!history || !user?.id || !Number.isInteger(limit) || limit < 1 || limit > 50) throw Object.assign(new Error("Invalid history search."), { code: "VALIDATION_ERROR" });
  const table = Prisma.raw(history.table);
  const predicate = walletHistoryPredicate(kind, query);
  const ownership = kind === "currency" ? Prisma.sql`(h."userId"=${user.id} OR h."recipientPublicId"=${user.publicId})` : Prisma.sql`h."userId"=${user.id}`;
  const after = cursor ? Prisma.sql`AND (h."createdAt", h.id) < (SELECT c."createdAt", c.id FROM ${table} c WHERE c.${Prisma.raw(`"${history.cursor}"`)}=${cursor})` : Prisma.empty;
  const filterKind = requestKind ? Prisma.sql`AND h.kind=${requestKind}` : Prisma.empty;
  const categoryFilter = kind === "transactions" ? Prisma.sql`AND ${walletCategorySql(category)}` : Prisma.empty;
  const rows = await db.$queryRaw(Prisma.sql`SELECT h.id FROM ${table} h WHERE ${ownership} ${after} ${filterKind} ${categoryFilter}
    AND ${predicate} ORDER BY h."createdAt" DESC, h.id DESC LIMIT ${limit + 1}`);
  return { id: { in: rows.map(row => row.id) } };
}

export function walletHistoryPredicate(kind, query) {
  if (!query) return Prisma.sql`TRUE`;
  const history = histories[kind];
  const textMatches = history.fields.map(field => Prisma.sql`POSITION(LOWER(${query}) IN LOWER(COALESCE(h.${Prisma.raw(`"${field}"`)}::text, ''))) > 0`);
  const identityMatches = Prisma.sql`(POSITION(LOWER(${query}) IN LOWER(u.name)) > 0
    OR POSITION(LOWER(${query}) IN LOWER(u."publicId")) > 0
    OR EXISTS (SELECT 1 FROM "SpecialIdAssignment" s WHERE s."userId"=u.id AND s.status='ACTIVE'
      AND s."revokedAt" IS NULL AND s."startsAt"<=CURRENT_TIMESTAMP AND s."expiresAt">CURRENT_TIMESTAMP
      AND POSITION(LOWER(${query}) IN LOWER(s."specialId"))>0))`;
  if (kind === "currency") {
    textMatches.push(Prisma.sql`EXISTS (SELECT 1 FROM "User" u WHERE (u.id=h."userId" OR u."publicId"=h."recipientPublicId") AND ${identityMatches})`);
  }
  if (kind === "transactions") {
    textMatches.push(Prisma.sql`EXISTS (SELECT 1 FROM "User" u WHERE
      (u."publicId" IN (h.metadata->>'senderId', h.metadata->>'recipientId', h.metadata->>'senderPublicId', h.metadata->>'recipientPublicId')
       OR EXISTS (SELECT 1 FROM "CurrencyRequest" r WHERE r.id=h."referenceId" AND (r."userId"=u.id OR r."recipientPublicId"=u."publicId")))
      AND ${identityMatches})`);
    for (const field of ["senderName", "recipientName"]) textMatches.push(Prisma.sql`POSITION(LOWER(${query}) IN LOWER(COALESCE(h.metadata->>${field}, ''))) > 0`);
  }
  return Prisma.sql`(${Prisma.join(textMatches, " OR ")})`;
}

export function walletCategoryWhere(category = "ALL") {
  const filters = { ALL: {}, COINS: { coins: { not: null } }, DIAMONDS: { diamonds: { not: null } }, RECHARGE: { type: "COIN_TOP_UP" } };
  if (!Object.hasOwn(filters, category)) throw Object.assign(new Error("Invalid history category."), { code: "VALIDATION_ERROR" });
  return filters[category];
}
function walletCategorySql(category) {
  walletCategoryWhere(category);
  return { ALL: Prisma.sql`TRUE`, COINS: Prisma.sql`h.coins IS NOT NULL`, DIAMONDS: Prisma.sql`h.diamonds IS NOT NULL`, RECHARGE: Prisma.sql`h.type='COIN_TOP_UP'` }[category];
}
