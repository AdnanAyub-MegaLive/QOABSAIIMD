import { ledgerData } from "./wallet.js";
import { setTimeout as retryDelay } from "node:timers/promises";
export function retryableConflict(error) {
  if (["P2034", "P2002"].includes(error?.code)) return true;
  if (error?.code !== "P2010") return false;
  const values = [error.meta], seen = new Set();
  while (values.length) {
    const value = values.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (value.kind === "TransactionWriteConflict" || [value.code, value.originalCode].some(code => ["40001", "40P01"].includes(code))) return true;
    values.push(value.cause, value.driverAdapterError);
  }
  return false;
}
const fail = (code, message, status = 409) => { throw Object.assign(new Error(message), { code, status }); };
export const occupiedSpecialId = now => ({ status: "ACTIVE", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

export async function purchaseSpecialId(db, userId, definitionId, requestKey) {
  if (typeof definitionId !== "string" || !definitionId || !/^[A-Za-z0-9._:-]{8,128}$/.test(requestKey || ""))
    fail("VALIDATION_ERROR", "Provide a Special ID and an Idempotency-Key of 8–128 characters.", 422);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async tx => {
        // Also serializes with admin assignment and allocation.
        // The lock returns void, which Prisma's pg adapter cannot deserialize.
        // Cast only its result; the transaction-scoped lock is unchanged.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || user.deletedAt || user.status !== "ACTIVE") fail("SESSION_REVOKED", "Account unavailable.", 401);
        const replay = await tx.specialIdPurchase.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
        if (replay) {
          if (replay.definitionId !== definitionId) fail("IDEMPOTENCY_CONFLICT", "This request key belongs to another purchase.");
          return replay.result;
        }
        const definition = await tx.specialIdDefinition.findUnique({ where: { id: definitionId } });
        if (!definition?.active || !definition.storeVisible || !definition.coinPrice || definition.coinPrice <= 0n)
          fail("SPECIAL_ID_NOT_FOR_SALE", "This Special ID is not available for purchase.");
        const now = new Date();
        if (await tx.specialIdAssignment.findFirst({ where: { specialId: definition.code, ...occupiedSpecialId(now) } }))
          fail("SPECIAL_ID_ALREADY_ASSIGNED", "This Special ID is already assigned.");
        const expiresAt = new Date(now.getTime() + definition.defaultDurationMinutes * 60000);
        if (!Number.isSafeInteger(definition.defaultDurationMinutes) || definition.defaultDurationMinutes <= 0 || !Number.isFinite(expiresAt.getTime())) fail("VALIDATION_ERROR", "Invalid ownership duration.", 422);
        const debit = await tx.user.updateMany({ where: { id: userId, coinBalance: { gte: definition.coinPrice } }, data: { coinBalance: { decrement: definition.coinPrice } } });
        if (!debit.count) fail("INSUFFICIENT_COINS", "Your Coin balance is too low.");
        await tx.specialIdAssignment.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "REPLACED", revokedAt: now } });
        const assignment = await tx.specialIdAssignment.create({ data: { userId, definitionId, specialId: definition.code, source: "PURCHASE", startsAt: now, expiresAt } });
        await tx.walletTransaction.create({ data: ledgerData({ userId, type: "SPECIAL_ID_PURCHASE", direction: "DEBIT", title: "Special ID purchase", coins: definition.coinPrice, referenceId: assignment.id, metadata: { definitionId, code: definition.code, requestKey } }) });
        const result = { assignmentId: assignment.id, specialId: definition.code, normalId: user.publicId, expiresAt: expiresAt.toISOString(), coinBalance: (user.coinBalance - definition.coinPrice).toString(), price: definition.coinPrice.toString() };
        await tx.specialIdPurchase.create({ data: { userId, requestKey, definitionId, result } });
        await tx.auditLog.create({ data: { action: "SPECIAL_ID_PURCHASE", category: "USER_MANAGEMENT", entityType: "User", entityId: userId, description: "Special ID purchased", metadata: result } });
        return result;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!retryableConflict(error)) throw error;
      if (attempt === 3) fail("SPECIAL_ID_PURCHASE_BUSY", "Another purchase is in progress. Retry with the same Idempotency-Key.", 409);
      await retryDelay(25 * 2 ** attempt + Math.floor(Math.random() * 25));
    }
  }
}
