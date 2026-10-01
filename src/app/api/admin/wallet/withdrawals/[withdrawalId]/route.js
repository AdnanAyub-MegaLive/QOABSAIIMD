import { portalPermissionError } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { requireFinanceAdmin } from "@/lib/portal-admin";
import { ledgerData } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

const actions = new Set(["APPROVE", "REJECT", "MARK_PAID"]);

export async function PATCH(request, { params }) {
  const permissionDenied = await portalPermissionError("finance.withdrawals");
  if (permissionDenied) return permissionDenied;

  const admin = await requireFinanceAdmin();
  if (!admin)
    return json({ success: false, error: { code: "UNAUTHORIZED", message: "Finance administrator access is required." } }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400);
  }
  const action = String(body?.action ?? "").trim().toUpperCase();
  if (!actions.has(action))
    return json({ success: false, error: { code: "VALIDATION_ERROR", message: "action must be APPROVE, REJECT, or MARK_PAID." } }, 422);
  const note = String(body?.note ?? "").trim().slice(0, 1000);
  const payoutReference = String(body?.payoutReference ?? "").trim().slice(0, 160);
  if (action === "REJECT" && !note)
    return json({ success: false, error: { code: "VALIDATION_ERROR", message: "A rejection reason is required." } }, 422);
  if (action === "MARK_PAID" && !payoutReference)
    return json({ success: false, error: { code: "VALIDATION_ERROR", message: "A provider payout reference is required." } }, 422);

  const { withdrawalId } = await params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.walletWithdrawal.findUnique({
        where: { publicId: withdrawalId },
        include: { user: { select: { id: true, publicId: true, name: true } } },
      });
      if (!withdrawal) throw new Error("WITHDRAWAL_NOT_FOUND");
      const reviewedAt = new Date();

      if (action === "APPROVE") {
        if (withdrawal.status !== "PENDING") throw new Error("WITHDRAWAL_STATE_CONFLICT");
        const updated = await tx.walletWithdrawal.update({
          where: { id: withdrawal.id },
          data: { status: "APPROVED", reviewedByAdminId: admin.id, reviewedAt, reviewNote: note || null, rejectionReason: null },
        });
        await tx.auditLog.create({ data: { adminId: admin.id, action: "WITHDRAWAL_APPROVED", category: "FINANCE", entityType: "WalletWithdrawal", entityId: updated.publicId, description: `${admin.name} approved withdrawal ${updated.publicId}.`, metadata: { userId: withdrawal.user.publicId, coins: withdrawal.coins.toString(), note: note || null } } });
        return updated;
      }

      if (action === "REJECT") {
        if (!["PENDING", "APPROVED"].includes(withdrawal.status)) throw new Error("WITHDRAWAL_STATE_CONFLICT");
        const updated = await tx.walletWithdrawal.update({
          where: { id: withdrawal.id },
          data: { status: "REJECTED", reviewedByAdminId: admin.id, reviewedAt, reviewNote: note, rejectionReason: note },
        });
        await tx.user.update({ where: { id: withdrawal.userId }, data: { hostSalaryCoinBalance: { increment: withdrawal.coins } } });
        await tx.walletTransaction.create({
          data: ledgerData({ userId: withdrawal.userId, type: "REFUND", direction: "CREDIT", title: "Withdrawal refund", description: `Withdrawal ${withdrawal.publicId} was rejected.`, diamonds: withdrawal.coins, cashAmount: withdrawal.cashAmount, currency: withdrawal.currency, referenceId: `WDRF-${withdrawal.publicId}`, metadata: { withdrawalId: withdrawal.publicId, reason: note } }),
        });
        await tx.auditLog.create({ data: { adminId: admin.id, action: "WITHDRAWAL_REJECTED", category: "FINANCE", entityType: "WalletWithdrawal", entityId: updated.publicId, description: `${admin.name} rejected withdrawal ${updated.publicId} and returned the reserved salary coins.`, metadata: { userId: withdrawal.user.publicId, coins: withdrawal.coins.toString(), reason: note } } });
        return updated;
      }

      if (withdrawal.status !== "APPROVED") throw new Error("WITHDRAWAL_STATE_CONFLICT");
      const updated = await tx.walletWithdrawal.update({
        where: { id: withdrawal.id },
        data: { status: "COMPLETED", reviewedByAdminId: admin.id, reviewedAt, reviewNote: note || withdrawal.reviewNote, providerPayoutReference: payoutReference, completedAt: reviewedAt },
      });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "WITHDRAWAL_PAID", category: "FINANCE", entityType: "WalletWithdrawal", entityId: updated.publicId, description: `${admin.name} marked withdrawal ${updated.publicId} as paid.`, metadata: { userId: withdrawal.user.publicId, coins: withdrawal.coins.toString(), payoutReference, note: note || null } } });
      return updated;
    }, { isolationLevel: "Serializable" });

    return json({ success: true, data: { withdrawalId: result.publicId, status: result.status, reviewedAt: result.reviewedAt?.toISOString() ?? null, completedAt: result.completedAt?.toISOString() ?? null, payoutReference: result.providerPayoutReference ?? null } });
  } catch (error) {
    const known = {
      WITHDRAWAL_NOT_FOUND: [404, "WITHDRAWAL_NOT_FOUND", "Withdrawal not found."],
      WITHDRAWAL_STATE_CONFLICT: [409, "WITHDRAWAL_STATE_CONFLICT", "This withdrawal cannot transition from its current state."],
      P2002: [409, "PAYOUT_REFERENCE_EXISTS", "This payout reference has already been used."],
    };
    const [status, code, message] = known[error?.code ?? error?.message] ?? [500, "WITHDRAWAL_REVIEW_FAILED", "Unable to review this withdrawal right now."];
    if (status === 500) console.error("Withdrawal review failed", error);
    return json({ success: false, error: { code, message } }, status);
  }
}
