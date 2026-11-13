import { ledgerData } from "./wallet.js";

export async function applyAdminDiamondDeduction(db, admin, { publicId, amount, reason, requestId }) {
  if (!/^\d+$/.test(String(amount)) || BigInt(amount) <= 0n || BigInt(amount) > 9223372036854775807n) throw new Error("INVALID_DIAMOND_AMOUNT");
  if (!/^[A-Za-z0-9-]{8,128}$/.test(requestId ?? "")) throw new Error("ADJUSTMENT_REQUEST_ID_REQUIRED");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) throw new Error("ADJUSTMENT_REASON_REQUIRED");
  const value = BigInt(amount);
  const fingerprint = JSON.stringify(["DEDUCT_DIAMONDS", publicId, String(value), reason.trim()]);
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
        if (user.hostSalaryCoinBalance < value) throw new Error("INSUFFICIENT_DIAMONDS");
        const after = user.hostSalaryCoinBalance - value;
        await tx.user.update({ where: { id: user.id }, data: { hostSalaryCoinBalance: { decrement: value } } });
        const referenceId = `DIAMOND-DEDUCTION:${admin.id}:${requestId}`;
        const metadata = { adminId: admin.id, wallet: "PERSONAL", currency: "DIAMONDS", requestId, balanceBefore: String(user.hostSalaryCoinBalance), balanceAfter: String(after) };
        await tx.walletTransaction.create({ data: ledgerData({ userId: user.id, type: "ADMIN_ADJUSTMENT", direction: "DEBIT", title: "Diamonds deducted by administrator", description: reason.trim(), diamonds: value, referenceId, metadata }) });
        await tx.auditLog.create({ data: { adminId: admin.id, action: "DEDUCT_DIAMONDS", category: "FINANCE", entityType: "User", entityId: publicId, description: reason.trim(), metadata: { ...metadata, amount: String(value), referenceId } } });
        const result = { balance: String(after), userId: user.id, referenceId };
        await tx.adminCoinAdjustmentRequest.create({ data: { adminId: admin.id, requestId, fingerprint, result } });
        return result;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt >= 3 || !["P2002", "P2034"].includes(error.code)) throw error;
    }
  }
}
