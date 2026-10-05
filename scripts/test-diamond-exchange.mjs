import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
config({ path: ".env.local", quiet: true });
assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname), "Local test database required.");
const { prisma } = await import("../src/lib/prisma.js");
const { exchangeDiamonds } = await import("../src/lib/diamond-exchange.js");
const { getAgencySalary } = await import("../src/lib/agency-salary.js");
async function cleanup(userId) {
  const fixture = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.ok(fixture.publicId.startsWith("TEST-EX-") && fixture.name === "Exchange integration fixture");
  await prisma.$transaction(async tx => {
    // Exclusive lock prevents any concurrent operation while removing this test's ledger.
    await tx.$executeRawUnsafe('LOCK TABLE "WalletTransaction" IN ACCESS EXCLUSIVE MODE');
    await tx.$executeRawUnsafe('ALTER TABLE "WalletTransaction" DISABLE TRIGGER "WalletTransaction_immutable"');
    await tx.walletTransaction.deleteMany({ where: { userId } });
    await tx.$executeRawUnsafe('ALTER TABLE "WalletTransaction" ENABLE TRIGGER "WalletTransaction_immutable"');
    await tx.user.delete({ where: { id: userId } });
  });
}
if (process.argv[2] === "--cleanup") {
  try { await cleanup(process.argv[3]); } finally { await prisma.$disconnect(); }
  process.exit(0);
}
const user = await prisma.user.create({ data: { publicId: `TEST-EX-${randomUUID()}`, name: "Exchange integration fixture", hostSalaryCoinBalance: 10000n, status: "ACTIVE" } });
// Override policy reads only for these test transactions. Never enable the live policy.
const policy = { enabled: true, diamondsPerCoin: 3n, minDiamonds: 100n };
const database = { $transaction: (work, options) => prisma.$transaction(tx => work(new Proxy(tx, { get(target, key) { return key === "diamondExchangeSettings" ? { findUnique: async () => policy } : target[key]; } })), options) };
try {
  const responses = await Promise.all(Array.from({ length: 3 }, () => exchangeDiamonds(user.id, "1000", "concurrent-request", database)));
  assert.deepEqual(responses[0], { diamonds: "9001", coins: "333", exchangedDiamonds: "999", receivedCoins: "333" });
  responses.forEach(r => assert.deepEqual(r, responses[0]));
  assert.equal(await prisma.walletTransaction.count({ where: { userId: user.id } }), 2);
  await assert.rejects(exchangeDiamonds(user.id, "1001", "concurrent-request", database), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(exchangeDiamonds(user.id, "99999", "insufficient-request", database), /INSUFFICIENT_DIAMONDS/);
  const failing = { $transaction: (work, options) => prisma.$transaction(tx => work(new Proxy(tx, { get(target, key) {
    if (key === "diamondExchangeSettings") return { findUnique: async () => policy };
    if (key === "walletTransaction") return { findUnique: (...args) => tx.walletTransaction.findUnique(...args), createMany: async () => { throw new Error("SIMULATED_LEDGER_FAILURE"); } };
    return target[key];
  } })), options) };
  await assert.rejects(exchangeDiamonds(user.id, "1000", "rollback-request", failing), /SIMULATED_LEDGER_FAILURE/);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(after.hostSalaryCoinBalance, 9001n); assert.equal(after.coinBalance, 333n);
  assert.equal(await prisma.walletTransaction.count({ where: { userId: user.id } }), 2);
  const agency = await prisma.agency.findFirst({ select: { id: true } });
  if (agency) {
    const salary = await getAgencySalary(agency.id);
    assert.equal(salary.hosts.reduce((sum, h) => sum + BigInt(h.salaryCoins), 0n).toString(), salary.totalSalaryCoins);
    console.log("PASS: agency monthly statement queries and per-host salary reconciliation.");
  }
  console.log("PASS: concurrent retry deduplication, paired ledger rows, rounding, balance checks and atomic rollback.");
} finally {
  try { await cleanup(user.id); } finally { await prisma.$disconnect(); }
}
