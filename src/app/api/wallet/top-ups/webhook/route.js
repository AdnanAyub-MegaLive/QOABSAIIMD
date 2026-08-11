import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mobileJson } from "@/lib/mobile-api";
import { ledgerData } from "@/lib/wallet";
import { syncProgressionProps } from "@/lib/props-store";
import { autoAssignEligibleSpecialId } from "@/lib/special-id";
import { emitToUser } from "@/lib/realtime";

function validSecret(request) {
  const expected = Buffer.from(String(process.env.PAYMENT_WEBHOOK_SECRET ?? ""));
  const supplied = Buffer.from(String(request.headers.get("x-wallet-webhook-secret") ?? ""));
  return expected.length > 0 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request) {
  if (!validSecret(request)) return mobileJson({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid webhook signature." } }, 401);
  try {
    const body = await request.json();
    const orderId = String(body?.orderId ?? "").trim();
    const providerReference = String(body?.providerReference ?? "").trim();
    const paymentStatus = String(body?.status ?? "").trim().toUpperCase();
    if (!orderId || !providerReference || !["COMPLETED", "FAILED"].includes(paymentStatus)) return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "orderId, providerReference, and a valid status are required." } }, 422);
    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.walletTopUpOrder.findUnique({
          where: { publicId: orderId },
          include: { user: { select: { publicId: true } } },
        });
        if (!order) throw new Error("ORDER_NOT_FOUND");
        if (order.status === "COMPLETED") return { order, newlyCompleted: false };
        if (order.status !== "PENDING") throw new Error("ORDER_RESOLVED");
        if (order.expiresAt <= new Date()) {
          const expired = await tx.walletTopUpOrder.update({ where: { id: order.id }, data: { status: "EXPIRED", providerReference }, include: { user: { select: { publicId: true } } } });
          return { order: expired, newlyCompleted: false };
        }
        if (paymentStatus === "FAILED") {
          const failed = await tx.walletTopUpOrder.update({ where: { id: order.id }, data: { status: "FAILED", providerReference }, include: { user: { select: { publicId: true } } } });
          return { order: failed, newlyCompleted: false };
        }
        const completed = await tx.walletTopUpOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", providerReference, completedAt: new Date() }, include: { user: { select: { publicId: true } } } });
        await tx.user.update({ where: { id: order.userId }, data: { coinBalance: { increment: order.totalCoins }, totalTopUp: { increment: order.baseCoins } } });
        await tx.walletTransaction.create({ data: ledgerData({ userId: order.userId, type: "COIN_TOP_UP", direction: "CREDIT", title: "Coins package", description: `${order.baseCoins.toString()} coins via ${order.paymentMethod}`, coins: order.totalCoins, cashAmount: order.amount, currency: order.currency, referenceId: order.publicId, metadata: { packageId: order.packageId, providerReference, baseCoins: order.baseCoins.toString(), bonusCoins: order.bonusCoins.toString() } }) });
        return { order: completed, newlyCompleted: true };
      },
      { isolationLevel: "Serializable" },
    );
    if (result.newlyCompleted) {
      await syncProgressionProps(result.order.userId);
      const assignment = await autoAssignEligibleSpecialId(result.order.user.publicId, "TOP_UP");
      if (assignment)
        emitToUser(result.order.user.publicId, "special-id:assigned", {
          success: true,
          data: { specialId: assignment.specialId, expiresAt: assignment.expiresAt.toISOString(), source: "TOP_UP" },
        });
    }
    return mobileJson({ success: true, data: { orderId: result.order.publicId, status: result.order.status } });
  } catch (error) {
    const known = { ORDER_NOT_FOUND: [404, "ORDER_NOT_FOUND", "Top-up order not found."], ORDER_RESOLVED: [409, "ORDER_RESOLVED", "Top-up order has already been resolved."], ORDER_EXPIRED: [409, "ORDER_EXPIRED", "Top-up order has expired."] };
    const [status, code, message] = known[error?.message] ?? [500, "WEBHOOK_FAILED", "Unable to process payment confirmation."];
    if (status === 500) console.error("Wallet payment webhook failed", error);
    return mobileJson({ success: false, error: { code, message } }, status);
  }
}
