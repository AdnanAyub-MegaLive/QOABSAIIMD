import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { reviewPage } from "@/lib/review-pagination";

export async function GET(request) {
  try {
    await requirePermission("finance.withdrawals");
    const params = new URL(request.url).searchParams, status = params.get("status") ?? "REVIEW", kind = params.get("kind") ?? "ALL";
    if (!["REVIEW", "ALL", "PENDING", "APPROVED", "COMPLETED", "REJECTED", "CANCELLED", "PENDING_EXTERNAL"].includes(status) || !["ALL", "USDT", "REDEMPTION", "RESELLER_TRANSFER"].includes(kind)) throw Object.assign(new Error("Invalid request filter."), { status: 422, code: "VALIDATION_ERROR" });
    const page = reviewPage(params, `currency:${status}:${kind}`, "createdAt", status === "REVIEW" || status === "PENDING" ? "asc" : "desc");
    const where = { ...(status === "ALL" ? {} : { status: status === "REVIEW" ? { in: ["PENDING", "APPROVED"] } : status }), ...(kind === "ALL" ? {} : { kind }) };
    const rows = await prisma.currencyRequest.findMany({ where: { AND: [where, page.after] }, orderBy: page.orderBy, take: page.take,
      select: { id: true, createdAt: true, kind: true, status: true, diamonds: true, quotedCoins: true, netUsdtMicros: true, destination: true, recipientPublicId: true, payoutHash: true, reviewNote: true, user: { select: { name: true, publicId: true } } } });
    return Response.json({ success: true, data: JSON.parse(JSON.stringify(page.result(rows), (_, value) => typeof value === "bigint" ? String(value) : value)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: { code: error.status ? error.code : "CURRENCY_QUEUE_FAILED", message: error.status ? error.message : "Unable to load currency requests." } }, { status: error.status ?? 500, headers: { "Cache-Control": "no-store" } });
  }
}
