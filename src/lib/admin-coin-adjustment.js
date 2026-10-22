import { ledgerData } from "./wallet.js";

// Future adjustments only. Never rewrites historical balances or ledger rows.
export async function applyAdminCoinAdjustment(db, admin, { publicId, operation, amount, reason, requestId }) {
  if (!["add", "remove"].includes(operation) || !/^\d+$/.test(String(amount)) || BigInt(amount) <= 0n || BigInt(amount) > 9223372036854775807n) throw new Error("INVALID_COIN_ADJUSTMENT");
  if (!/^[A-Za-z0-9-]{8,128}$/.test(requestId ?? "")) throw new Error("ADJUSTMENT_REQUEST_ID_REQUIRED");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) throw new Error("ADJUSTMENT_REASON_REQUIRED");
  const value = BigInt(amount), fingerprint = JSON.stringify([publicId, operation, String(value), reason.trim()]);
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const existing = await tx.adminCoinAdjustmentRequest.findUnique({ where: { adminId_requestId: { adminId: admin.id, requestId } } });
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw new Error("ADJUSTMENT_REQUEST_CONFLICT");
          return existing.result;
        }
        const user = await tx.user.findUniqueOrThrow({ where: { publicId } });
        if (user.deletedAt) throw new Error("USER_NOT_FOUND");
        if (operation === "remove" && user.coinBalance < value) throw new Error("INSUFFICIENT_COINS");
        const after = operation === "add" ? user.coinBalance + value : user.coinBalance - value;
        if (after > 9223372036854775807n) throw new Error("BALANCE_LIMIT_EXCEEDED");
        await tx.user.update({ where: { id: user.id }, data: { coinBalance: after, ...(operation === "add" ? { totalTopUp: { increment: value } } : {}) } });
        await tx.coinAdjustment.create({ data: { userId: user.id, adminId: admin.id, operation: operation === "add" ? "ADD" : "REMOVE", amount: value, balanceBefore: user.coinBalance, balanceAfter: after, reason: reason.trim() } });
        const referenceId = `COIN-ADJUSTMENT:${admin.id}:${requestId}`;
        await tx.walletTransaction.create({ data: ledgerData({ userId: user.id, type: "ADMIN_ADJUSTMENT", direction: operation === "add" ? "CREDIT" : "DEBIT", title: operation === "add" ? "Coins added by administrator" : "Coins removed by administrator", description: reason.trim(), coins: value, referenceId, metadata: { adminId: admin.id, operation, wallet: "PERSONAL", requestId } }) });
        await tx.auditLog.create({ data: { adminId: admin.id, action: operation === "add" ? "ADD_COINS" : "REMOVE_COINS", category: "FINANCE", entityType: "User", entityId: publicId, description: reason.trim(), metadata: { amount: String(value), operation, balanceBefore: String(user.coinBalance), balanceAfter: String(after), wallet: "PERSONAL", requestId, referenceId } } });
        const result = { balance: String(after), userId: user.id, referenceId };
        await tx.adminCoinAdjustmentRequest.create({ data: { adminId: admin.id, requestId, fingerprint, result } });
        return result;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt >= 3 || !["P2002", "P2034"].includes(error.code)) throw error;
    }
  }
}
