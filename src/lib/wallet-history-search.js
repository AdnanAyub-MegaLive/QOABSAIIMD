import { WalletTransactionType, WalletTransactionStatus, WalletOrderStatus } from "@prisma/client";
import { activeSearchSpecialId } from "./user-search.js";

export async function walletHistorySearch(db, kind, input) {
  const q = String(input ?? "").trim();
  if (!q) return {};
  if (q.length > 120) throw Object.assign(new Error("Search cannot exceed 120 characters."), { code: "VALIDATION_ERROR" });
  const contains = { contains: q, mode: "insensitive" };
  const fields = kind === "transactions" ? ["publicId", "referenceId", "title", "description"] : kind === "withdrawals" ? ["publicId", "method", "currency", "accountName"] : ["id", "kind", "status", "recipientPublicId"];
  const OR = fields.map(field => ({ [field]: contains }));
  const enums = kind === "transactions" ? { type: WalletTransactionType, status: WalletTransactionStatus } : kind === "withdrawals" ? { status: WalletOrderStatus } : {};
  for (const [field, values] of Object.entries(enums)) {
    const matches = Object.values(values).filter(value => value.toLowerCase().includes(q.toLowerCase()));
    if (matches.length) OR.push({ [field]: { in: matches } });
  }
  if (/^\d{1,18}$/.test(q)) {
    for (const field of kind === "transactions" ? ["coins", "diamonds"] : kind === "withdrawals" ? ["coins"] : ["diamonds", "quotedCoins", "netUsdtMicros"]) OR.push({ [field]: BigInt(q) });
  }
  if (kind !== "currency" && /^\d{1,10}(\.\d{1,2})?$/.test(q)) OR.push({ cashAmount: q });
  const users = kind === "withdrawals" ? [] : await db.user.findMany({ where: { OR: [{ name: contains }, { publicId: contains }, { specialIds: { some: { ...activeSearchSpecialId(new Date()), specialId: contains } } }] }, select: { id: true, publicId: true } });
  if (kind === "currency") {
    OR.push({ userId: { in: users.map(user => user.id) } }, { recipientPublicId: { in: users.map(user => user.publicId) } });
  } else if (kind === "transactions") {
    for (const field of ["senderId", "recipientId", "senderPublicId", "recipientPublicId", "senderName", "recipientName"]) OR.push({ metadata: { path: [field], string_contains: q, mode: "insensitive" } });
    if (users.length) {
      const requests = await db.currencyRequest.findMany({ where: { OR: [{ userId: { in: users.map(user => user.id) } }, { recipientPublicId: { in: users.map(user => user.publicId) } }] }, select: { id: true } });
      OR.push({ referenceId: { in: requests.map(row => row.id) } });
      for (const user of users) for (const field of ["senderId", "recipientId", "senderPublicId", "recipientPublicId"]) OR.push({ metadata: { path: [field], equals: user.publicId } });
    }
  }
  return { OR };
}
