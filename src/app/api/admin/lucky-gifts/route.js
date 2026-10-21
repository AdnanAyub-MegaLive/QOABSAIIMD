import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { LUCKY_POLICY_ID, expectedReturnBps, luckyPolicy, multiplierLabel, validateLuckyPolicy } from "@/lib/lucky-gifts";

const fail = (e) => Response.json({ success: false, error: { message: e.status ? e.message : "Unable to manage Lucky Gifts." } }, { status: e.status ?? 500 });

async function snapshot(db) {
  const [policy, pool] = await Promise.all([
    luckyPolicy(db),
    db.luckyGiftPool.upsert({ where: { id: LUCKY_POLICY_ID }, update: {}, create: { id: LUCKY_POLICY_ID } }),
  ]);
  return {
    version: policy.version,
    configured: policy.configured,
    poolContributionPercent: policy.poolContributionBps / 100,
    bigWinMinCoins: String(policy.bigWinMinCoins),
    multipliers: policy.multipliers.map((row) => ({ multiplier: multiplierLabel(row.multiplierBps), weight: row.weight })),
    expectedReturnPercent: expectedReturnBps(policy.multipliers) / 100,
    pool: { balance: String(pool.balance), collected: String(pool.collected), paidOut: String(pool.paidOut) },
  };
}

export async function GET() {
  try { await requirePermission("rules.view"); return Response.json({ success: true, data: await snapshot(prisma) }); }
  catch (e) { return fail(e); }
}

export async function PUT(request) {
  try {
    const admin = await requirePermission("rules.manage");
    sameOrigin(request);
    const body = await jsonBody(request);
    const values = validateLuckyPolicy(body);
    if (!Number.isSafeInteger(body.version) || body.version < 0) throw Object.assign(new Error("Invalid version."), { status: 422 });
    const data = await prisma.$transaction(async (tx) => {
      const current = await tx.luckyGiftPolicy.findUnique({ where: { id: LUCKY_POLICY_ID } });
      if ((current?.version ?? 0) !== body.version) throw Object.assign(new Error("Lucky Gift settings changed. Reload first."), { status: 409 });
      if (current) await tx.luckyGiftPolicy.update({ where: { id: LUCKY_POLICY_ID }, data: { ...values, version: { increment: 1 }, updatedByAdminId: admin.id } });
      else await tx.luckyGiftPolicy.create({ data: { id: LUCKY_POLICY_ID, ...values, version: 1, updatedByAdminId: admin.id } });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "LUCKY_GIFT_POLICY_UPDATED", category: "FINANCE", entityType: "LuckyGiftPolicy", entityId: LUCKY_POLICY_ID,
        description: `Lucky Gift policy updated: ${values.poolContributionBps / 100}% to pool, expected return ${expectedReturnBps(values.multipliers) / 100}%.`,
        metadata: { poolContributionBps: values.poolContributionBps, bigWinMinCoins: String(values.bigWinMinCoins), multipliers: values.multipliers } } });
      return snapshot(tx);
    });
    return Response.json({ success: true, data });
  } catch (e) { return fail(e); }
}

export async function POST(request) {
  try {
    const admin = await requirePermission("rules.manage");
    sameOrigin(request);
    const body = await jsonBody(request);
    const coins = String(body?.coins ?? "").trim();
    if (!/^-?\d{1,15}$/.test(coins) || BigInt(coins) === 0n) throw Object.assign(new Error("Enter a whole number of Coins to add (or a negative number to remove)."), { status: 422 });
    const note = String(body?.note ?? "").trim().slice(0, 200);
    if (!note) throw Object.assign(new Error("Add a short note explaining the adjustment."), { status: 422 });
    const change = BigInt(coins);
    const data = await prisma.$transaction(async (tx) => {
      await tx.luckyGiftPool.upsert({ where: { id: LUCKY_POLICY_ID }, update: {}, create: { id: LUCKY_POLICY_ID } });
      await tx.$queryRaw`SELECT "id" FROM "LuckyGiftPool" WHERE "id" = ${LUCKY_POLICY_ID} FOR UPDATE`;
      const pool = await tx.luckyGiftPool.findUniqueOrThrow({ where: { id: LUCKY_POLICY_ID } });
      if (pool.balance + change < 0n) throw Object.assign(new Error("The pool cannot go below zero."), { status: 422 });
      await tx.luckyGiftPool.update({ where: { id: LUCKY_POLICY_ID }, data: { balance: pool.balance + change } });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "LUCKY_GIFT_POOL_ADJUSTED", category: "FINANCE", entityType: "LuckyGiftPool", entityId: LUCKY_POLICY_ID,
        description: `Lucky pool adjusted by ${coins} Coins: ${note}`, metadata: { coins, note, before: String(pool.balance), after: String(pool.balance + change) } } });
      return snapshot(tx);
    });
    return Response.json({ success: true, data });
  } catch (e) { return fail(e); }
}
