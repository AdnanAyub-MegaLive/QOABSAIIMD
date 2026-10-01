import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mobileJson } from "@/lib/mobile-api";
import { ledgerData } from "@/lib/wallet";
import { syncProgressionProps } from "@/lib/props-store";
import { autoAssignEligibleSpecialId } from "@/lib/special-id";
import { emitToUser } from "@/lib/realtime";

function equal(value, expected) {
  const supplied = Buffer.from(String(value ?? ""));
  const expectedBuffer = Buffer.from(String(expected ?? ""));
  return expectedBuffer.length > 0 && supplied.length === expectedBuffer.length && timingSafeEqual(supplied, expectedBuffer);
}

function validWebhookSignature(request, rawBody) {
  const secret = String(process.env.PAYMENT_WEBHOOK_SECRET ?? "");
  const timestamp = request.headers.get("x-wallet-timestamp");
  const signature = request.headers.get("x-wallet-signature");
  const maximumAge = Math.max(30, Number(process.env.PAYMENT_WEBHOOK_MAX_AGE_SECONDS ?? 300));
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (secret && signature && Number.isInteger(timestampSeconds) && Math.abs(nowSeconds - timestampSeconds) <= maximumAge) {
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
    return equal(signature, expected);
  }
  return process.env.PAYMENT_WEBHOOK_ALLOW_LEGACY_SECRET === "true" && equal(request.headers.get("x-wallet-webhook-secret"), secret);
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    if (!validWebhookSignature(request, rawBody)) return mobileJson({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid webhook signature." } }, 401);
    const body = JSON.parse(rawBody);
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
        if (order.status !== "PENDING") {
          if (order.providerReference === providerReference) return { order, newlyCompleted: false };
          throw new Error("ORDER_PROVIDER_REFERENCE_MISMATCH");
        }
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
    const known = {
      ORDER_NOT_FOUND: [404, "ORDER_NOT_FOUND", "Top-up order not found."],
      ORDER_PROVIDER_REFERENCE_MISMATCH: [409, "ORDER_PROVIDER_REFERENCE_MISMATCH", "The payment reference does not match the resolved order."],
      P2002: [409, "PROVIDER_REFERENCE_EXISTS", "The provider payment reference has already been used."],
      SyntaxError: [400, "INVALID_JSON", "The webhook request body must be valid JSON."],
    };
    const [status, code, message] = known[error?.code ?? error?.name ?? error?.message] ?? [500, "WEBHOOK_FAILED", "Unable to process payment confirmation."];
    if (status === 500) console.error("Wallet payment webhook failed", error);
    return mobileJson({ success: false, error: { code, message } }, status);
  }
}
