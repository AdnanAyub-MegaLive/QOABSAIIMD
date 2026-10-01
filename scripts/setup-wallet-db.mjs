import { config } from "dotenv";

config({ path: ".env.local" });
const { prisma } = await import("../src/lib/prisma.js");

const packages = [
  ["COIN_1000", 1000n, 0, "50", false, 10],
  ["COIN_5000", 5000n, 5, "240", false, 20],
  ["COIN_10000", 10000n, 10, "460", false, 30],
  ["COIN_25000", 25000n, 20, "1050", true, 40],
  ["COIN_50000", 50000n, 25, "2000", false, 50],
];

try {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_userId_type_referenceId_key"
    ON "WalletTransaction"("userId", "type", "referenceId");
  `);
  for (const [id, coins, bonusPercent, price, bestValue, sortOrder] of packages)
    await prisma.walletCoinPackage.upsert({
      where: { id },
      update: { coins, bonusPercent, price, bestValue, sortOrder, currency: "PKR", active: true },
      create: { id, coins, bonusPercent, price, bestValue, sortOrder, currency: "PKR" },
    });

  const [gifts, purchases, adjustments] = await Promise.all([
    prisma.giftTransaction.findMany({
      include: {
        sender: { select: { publicId: true, name: true } },
        recipientUser: { select: { id: true, publicId: true } },
        settlement: true,
      },
    }),
    prisma.propPurchase.findMany(),
    prisma.coinAdjustment.findMany(),
  ]);
  const ledgerRows = [];
  for (const gift of gifts) {
    ledgerRows.push({
      publicId: `TXN-BACKFILL-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      userId: gift.senderId,
      type: "GIFT_SENT",
      direction: "DEBIT",
      title: `Sent ${gift.giftName}`,
      description: gift.recipientUser?.publicId ? `To ${gift.recipientUser.publicId}` : "Sent to host",
      coins: gift.coinValue,
      referenceId: gift.id,
      status: "COMPLETED",
      metadata: { backfilled: true, quantity: gift.quantity },
      createdAt: gift.createdAt,
    });
    if (gift.recipientUser && gift.settlement) {
      const isHost = gift.settlement.recipientType === "HOST";
      const value = isHost ? gift.settlement.hostSalaryCoins : gift.settlement.reusableCoins;
      if (value > 0n)
        ledgerRows.push({
          publicId: `TXN-BACKFILL-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
          userId: gift.recipientUser.id,
          type: "GIFT_RECEIVED",
          direction: "CREDIT",
          title: "Received from Gift",
          description: `From ${gift.sender.name} (${gift.sender.publicId})`,
          coins: isHost ? null : value,
          diamonds: isHost ? value : null,
          referenceId: gift.id,
          status: "COMPLETED",
          metadata: { backfilled: true, grossCoins: gift.coinValue.toString() },
          createdAt: gift.createdAt,
        });
    }
  }
  for (const purchase of purchases)
    ledgerRows.push({
      publicId: `TXN-BACKFILL-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      userId: purchase.userId,
      type: "STORE_PURCHASE",
      direction: "DEBIT",
      title: "Store purchase",
      description: purchase.assetName,
      coins: purchase.price,
      referenceId: purchase.publicId,
      status: "COMPLETED",
      metadata: { backfilled: true, assetId: purchase.assetPublicId },
      createdAt: purchase.createdAt,
    });
  for (const adjustment of adjustments)
    ledgerRows.push({
      publicId: `TXN-BACKFILL-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      userId: adjustment.userId,
      type: "ADMIN_ADJUSTMENT",
      direction: adjustment.operation === "ADD" ? "CREDIT" : "DEBIT",
      title: adjustment.operation === "ADD" ? "Coins added by administrator" : "Coins removed by administrator",
      description: adjustment.reason,
      coins: adjustment.operation === "ADD" ? adjustment.amount : adjustment.balanceBefore - adjustment.balanceAfter,
      referenceId: adjustment.id,
      status: "COMPLETED",
      metadata: { backfilled: true, adminId: adjustment.adminId },
      createdAt: adjustment.createdAt,
    });
  for (let index = 0; index < ledgerRows.length; index += 500)
    await prisma.walletTransaction.createMany({ data: ledgerRows.slice(index, index + 500), skipDuplicates: true });

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION prevent_wallet_transaction_mutation()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'WalletTransaction is an immutable ledger; append a reversal instead';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS "WalletTransaction_immutable" ON "WalletTransaction";
    CREATE TRIGGER "WalletTransaction_immutable"
    BEFORE UPDATE OR DELETE ON "WalletTransaction"
    FOR EACH ROW EXECUTE FUNCTION prevent_wallet_transaction_mutation();
  `);
  console.log(`Wallet packages ready: ${await prisma.walletCoinPackage.count()}; ledger rows: ${await prisma.walletTransaction.count()}`);
} finally {
  await prisma.$disconnect();
}
