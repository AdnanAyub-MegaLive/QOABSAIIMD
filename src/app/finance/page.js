import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import FinanceConsole from "./finance-console";
import { prisma } from "../../lib/prisma";
import { reconcileWalletBalances } from "../../lib/wallet-reconciliation";

const financeRoles = new Set(["ADMIN", "SENIOR_ADMIN", "SUPER_ADMIN"]);

export default async function FinancePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/");
  const admin = await prisma.admin.findFirst({
    where: { email: session.user.email.toLowerCase(), active: true },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!admin || !financeRoles.has(admin.role)) redirect("/home");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [withdrawals, topUps, gifts, packages, users, ledger] = await Promise.all([
    prisma.walletWithdrawal.findMany({
      include: {
        user: { select: { publicId: true, name: true, phone: true, isVerified: true } },
        reviewedBy: { select: { name: true, email: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 150,
    }),
    prisma.walletTopUpOrder.findMany({
      include: { user: { select: { publicId: true, name: true } }, package: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 150,
    }),
    prisma.giftTransaction.findMany({
      include: {
        sender: { select: { publicId: true, name: true } },
        recipientUser: { select: { publicId: true, name: true } },
        talent: { select: { publicId: true, displayName: true } },
        settlement: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 150,
    }),
    prisma.walletCoinPackage.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { coins: "asc" }],
    }),
    prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, publicId: true, name: true, coinBalance: true, hostSalaryCoinBalance: true },
      orderBy: { publicId: "asc" },
      take: 500,
    }),
    prisma.walletTransaction.findMany({
      where: { status: { in: ["COMPLETED", "PENDING"] } },
      include: { user: { select: { publicId: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1000,
    }),
  ]);

  const ledgerByUser = new Map();
  for (const entry of ledger) {
    const entries = ledgerByUser.get(entry.userId) ?? [];
    entries.push(entry);
    ledgerByUser.set(entry.userId, entries);
  }
  const reconciliations = users.map((user) => ({
    ...reconcileWalletBalances(user, ledgerByUser.get(user.id) ?? []),
    name: user.name,
  }));
  const pendingWithdrawals = withdrawals.filter((item) => ["PENDING", "APPROVED"].includes(item.status));
  const completedTopUpsToday = topUps.filter((item) => item.status === "COMPLETED" && item.completedAt && item.completedAt >= todayStart);
  const giftsToday = gifts.filter((item) => item.createdAt >= todayStart).reduce((total, item) => total + item.coinValue, 0n);

  const props = {
    admin: { name: admin.name, email: admin.email, role: admin.role },
    stats: {
      pendingWithdrawals: pendingWithdrawals.length,
      completedTopUpsToday: completedTopUpsToday.length,
      topUpAmountToday: completedTopUpsToday.reduce((total, item) => total + Number(item.amount), 0).toFixed(2),
      giftsToday: giftsToday.toString(),
      reconciliationAlerts: reconciliations.filter((item) => item.status !== "MATCHED").length,
    },
    withdrawals: withdrawals.map((item) => ({
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
    })),
    reconciliations,
    topUps: topUps.map((item) => ({
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
    })),
    gifts: gifts.map((item) => ({
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
    })),
    packages: packages.map((item) => ({
      id: item.id,
      coins: item.coins.toString(),
      bonusPercent: item.bonusPercent,
      price: item.price.toString(),
      currency: item.currency,
      active: item.active,
      bestValue: item.bestValue,
    })),
    ledger: ledger.slice(0, 200).map((item) => ({
      id: item.publicId,
      user: item.user.name,
      userId: item.user.publicId,
      type: item.type,
      direction: item.direction,
      title: item.title,
      coins: item.coins?.toString() ?? null,
      diamonds: item.diamonds?.toString() ?? null,
      amount: item.cashAmount?.toString() ?? null,
      currency: item.currency,
      status: item.status,
      referenceId: item.referenceId,
      createdAt: item.createdAt.toISOString(),
    })),
    integration: {
      checkoutConfigured: Boolean(process.env.PAYMENT_CHECKOUT_BASE_URL),
      webhookConfigured: Boolean(process.env.PAYMENT_WEBHOOK_SECRET),
      legacyWebhookAllowed: process.env.PAYMENT_WEBHOOK_ALLOW_LEGACY_SECRET === "true",
    },
  };

  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0">
            <p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">Financial operations</p>
            <h1 className="text-xl font-bold">Finance & Wallet</h1>
          </div>
          <FeatureSearch />
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{admin.name}</p>
              <p className="text-xs text-[#718580]">{admin.role.replaceAll("_", " ")}</p>
            </div>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
              <button className="rounded-lg border border-[#d7e4e1] px-4 py-2 text-xs font-semibold text-[#526b67] hover:bg-[#f1f7f5]">Sign out</button>
            </form>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7">
            <h2 className="text-2xl font-bold">Wallet control center</h2>
            <p className="mt-1.5 text-sm text-[#71847f]">Review payouts, trace immutable ledger activity, validate balances, and monitor mobile payment integration.</p>
          </div>
          <FinanceConsole {...props} />
        </div>
      </section>
    </main>
  );
}
