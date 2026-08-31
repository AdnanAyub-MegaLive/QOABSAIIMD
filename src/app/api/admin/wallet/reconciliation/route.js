import { prisma } from "@/lib/prisma";
import { requireFinanceAdmin } from "@/lib/portal-admin";
import { reconcileWalletBalances } from "@/lib/wallet-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request) {
  const admin = await requireFinanceAdmin();
  if (!admin)
    return json({ success: false, error: { code: "UNAUTHORIZED", message: "Finance administrator access is required." } }, 401);

  const requestedUserId = new URL(request.url).searchParams.get("userId")?.trim();
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(requestedUserId ? { publicId: requestedUserId } : {}),
    },
    select: { id: true, publicId: true, coinBalance: true, hostSalaryCoinBalance: true },
    orderBy: { publicId: "asc" },
    take: requestedUserId ? 1 : 500,
  });
  if (requestedUserId && !users.length)
    return json({ success: false, error: { code: "USER_NOT_FOUND", message: "User not found." } }, 404);

  const transactions = await prisma.walletTransaction.findMany({
    where: {
      userId: { in: users.map((user) => user.id) },
      status: { in: ["COMPLETED", "PENDING"] },
    },
    select: { userId: true, direction: true, status: true, coins: true, diamonds: true },
  });
  const transactionsByUser = new Map();
  for (const transaction of transactions) {
    const list = transactionsByUser.get(transaction.userId) ?? [];
    list.push(transaction);
    transactionsByUser.set(transaction.userId, list);
  }
  const reconciliations = users.map((user) =>
    reconcileWalletBalances(user, transactionsByUser.get(user.id) ?? []),
  );
  const matched = reconciliations.filter((item) => item.status === "MATCHED").length;

  return json({
    success: true,
    data: {
      reconciliations,
      summary: {
        usersChecked: reconciliations.length,
        matched,
        requiresBaselineOrInvestigation: reconciliations.length - matched,
      },
    },
  });
}
