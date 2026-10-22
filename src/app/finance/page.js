import { requirePagePermission } from "@/lib/portal-admin";
import { hasPermission } from "@/lib/portal-permissions";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import FeatureSearch from "../components/feature-search";
import PortalSidebar from "../components/portal-sidebar";
import FinanceConsole from "./finance-console";
import { prisma } from "../../lib/prisma";
import { readWalletReconciliation } from "../../lib/wallet-reconciliation";

export default async function FinancePage() {
  const admin = await requirePagePermission("finance.view");
  const session = await auth();
  if (!session?.user?.email) redirect("/");

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [packages, reconciliations, pendingWithdrawals, topUpTotals, giftTotals] = await Promise.all([
    prisma.walletCoinPackage.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { coins: "asc" }],
    }),
    readWalletReconciliation(prisma),
    prisma.walletWithdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.walletTopUpOrder.groupBy({ by: ["currency"], where: { status: "COMPLETED", completedAt: { gte: todayStart } }, _count: true, _sum: { amount: true } }),
    prisma.giftTransaction.aggregate({ where: { createdAt: { gte: todayStart } }, _sum: { coinValue: true } }),
  ]);


  const props = {
    admin: { name: admin.name, email: admin.email, role: admin.role },
    stats: {
      pendingWithdrawals,
      completedTopUpsToday: topUpTotals.reduce((sum, row) => sum + row._count, 0),
      topUpAmountsToday: topUpTotals.map(row => `${row.currency} ${row._sum.amount?.toFixed(2) ?? "0.00"}`).join(" · ") || "No completed top-ups (UTC)",
      giftsToday: String(giftTotals._sum.coinValue ?? 0n),
      reconciliationAlerts: reconciliations.filter((item) => item.status !== "MATCHED").length,
    },
    reconciliations,
    packages: packages.map((item) => ({
      id: item.id,
      coins: item.coins.toString(),
      bonusPercent: item.bonusPercent,
      price: item.price.toString(),
      currency: item.currency,
      active: item.active,
      bestValue: item.bestValue,
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
          <FinanceConsole {...props} canRefund={hasPermission(admin,"finance.refunds")} canReview={hasPermission(admin,"finance.withdrawals")} />
        </div>
      </section>
    </main>
  );
}
