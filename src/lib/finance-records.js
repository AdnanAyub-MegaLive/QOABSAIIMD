import { reviewPage } from "./review-pagination.js";
const userSelect = { name: true, publicId: true };
export async function financeRecords(db, params) {
  const kind = params.get("kind") ?? "withdrawals", status = params.get("status") ?? (kind === "withdrawals" ? "OPEN" : "ALL"), q = (params.get("q") ?? "").trim();
  if (!["withdrawals", "topUps", "gifts", "ledger"].includes(kind)) throw Object.assign(new Error("Invalid finance record type."), { status: 422, code: "VALIDATION_ERROR" });
  const config = {
    withdrawals: { model: "walletWithdrawal", row: withdrawalsRow, include: { user: { select: { ...userSelect, phone: true, isVerified: true } }, reviewedBy: { select: { name: true } } } },
    topUps: { model: "walletTopUpOrder", row: topUpsRow, include: { user: { select: userSelect } } },
    gifts: { model: "giftTransaction", row: giftsRow, include: { sender: { select: userSelect }, recipientUser: { select: userSelect }, talent: { select: { displayName: true, publicId: true } }, settlement: true } },
    ledger: { model: "walletTransaction", row: ledgerRow, include: { user: { select: userSelect } } },
  }[kind];
  const statuses = kind === "gifts" ? ["ALL"] : kind === "ledger" ? ["ALL", "PENDING", "COMPLETED", "FAILED", "REVERSED"] : ["ALL", "PENDING", "APPROVED", "REJECTED", "COMPLETED", "FAILED", "EXPIRED", "CANCELLED", ...(kind === "withdrawals" ? ["OPEN"] : [])];
  if (!config || !statuses.includes(status) || q.length > 100) throw Object.assign(new Error("Invalid finance filters."), { status: 422, code: "VALIDATION_ERROR" });
  const contains = { contains: q, mode: "insensitive" };
  const search = !q ? {} : kind === "gifts" ? { OR: [{ id: contains }, { giftName: contains }, { sender: { OR: [{ name: contains }, { publicId: contains }] } }, { recipientUser: { OR: [{ name: contains }, { publicId: contains }] } }, { talent: { OR: [{ displayName: contains }, { publicId: contains }] } }] } : { OR: [{ publicId: contains }, { user: { OR: [{ name: contains }, { publicId: contains }] } }] };
  const page = reviewPage(params, `finance:${kind}:${status}:${q}`, "createdAt", kind === "withdrawals" && ["OPEN", "PENDING"].includes(status) ? "asc" : "desc");
  const rows = await db[config.model].findMany({ where: { AND: [status === "ALL" ? {} : { status: status === "OPEN" ? { in: ["PENDING", "APPROVED"] } : status }, search, page.after] }, include: config.include, orderBy: page.orderBy, take: page.take });
  const result = page.result(rows);
  return { ...result, items: result.items.map(config.row) };
}
export const withdrawalsRow = item => ({
      id: item.publicId,
      host: item.user.name,
      hostId: item.user.publicId,
      hostPhone: item.user.phone,
      hostVerified: item.user.isVerified,
      coins: item.coins.toString(),
      amount: item.cashAmount.toString(),
      currency: item.currency,
      method: item.method,
      accountName: item.accountName,
      accountNumber: item.accountNumber,
      status: item.status,
      reviewNote: item.reviewNote,
      rejectionReason: item.rejectionReason,
      payoutReference: item.providerPayoutReference,
      createdAt: item.createdAt.toISOString(),
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      completedAt: item.completedAt?.toISOString() ?? null,
      reviewer: item.reviewedBy?.name ?? null,
    });

export const topUpsRow = item => ({
      id: item.publicId,
      user: item.user.name,
      userId: item.user.publicId,
      packageId: item.packageId,
      paymentMethod: item.paymentMethod,
      amount: item.amount.toString(),
      currency: item.currency,
      baseCoins: item.baseCoins.toString(),
      bonusCoins: item.bonusCoins.toString(),
      totalCoins: item.totalCoins.toString(),
      status: item.status,
      providerReference: item.providerReference,
      createdAt: item.createdAt.toISOString(),
      expiresAt: item.expiresAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
    });

export const giftsRow = item => ({
      id: item.id,
      giftName: item.giftName,
      quantity: item.quantity,
      grossCoins: item.coinValue.toString(),
      roomId: item.roomId,
      sender: item.sender.name,
      senderId: item.sender.publicId,
      recipient: item.talent?.displayName ?? item.recipientUser?.name ?? "Unknown recipient",
      recipientId: item.talent?.publicId ?? item.recipientUser?.publicId ?? null,
      createdAt: item.createdAt.toISOString(),
      settlement: item.settlement && {
        recipientType: item.settlement.recipientType,
        hostSalaryCoins: item.settlement.hostSalaryCoins.toString(),
        agencyCoins: item.settlement.agencyCoins.toString(),
        companyCoins: item.settlement.companyCoins.toString(),
        reusableCoins: item.settlement.reusableCoins.toString(),
        policyVersion: item.settlement.policyVersion,
      },
    });

export const ledgerRow = item => ({
      id: item.publicId,
      user: item.user.name,
      userId: item.user.publicId,
      type: item.type,
      direction: item.direction,
      title: item.type === "VIP_PURCHASE" ? "VIP purchase" : item.title,
      coins: item.coins?.toString() ?? null,
      diamonds: item.diamonds?.toString() ?? null,
      amount: item.cashAmount?.toString() ?? null,
      currency: item.currency,
      status: item.status,
      referenceId: item.referenceId,
      createdAt: item.createdAt.toISOString(),
    });

