import { randomInt } from "node:crypto";

export const LUCKY_POLICY_ID = "GLOBAL";
export const luckyDefaults = {
  poolContributionBps: 6000,
  bigWinMinCoins: 10000n,
  multipliers: [
    { multiplierBps: 0, weight: 5000 },
    { multiplierBps: 10000, weight: 4000 },
    { multiplierBps: 20000, weight: 700 },
    { multiplierBps: 50000, weight: 200 },
    { multiplierBps: 100000, weight: 80 },
    { multiplierBps: 500000, weight: 15 },
    { multiplierBps: 1000000, weight: 4 },
    { multiplierBps: 5000000, weight: 1 },
  ],
};

const MAX_MULTIPLIER_BPS = 10000000;
const MAX_WEIGHT = 1000000;
export const luckyError = (message) => Object.assign(new Error(message), { code: "VALIDATION_ERROR", status: 422 });

export function multiplierLabel(bps) {
  const whole = Math.floor(bps / 10000), rest = bps % 10000;
  return rest ? `${whole}.${String(rest).padStart(4, "0").replace(/0+$/, "")}` : String(whole);
}

export function parseMultiplier(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,4}(\.\d{1,4})?$/.test(text)) throw luckyError("Multipliers must be numbers like 0, 0.5, 2 or 500 (up to 4 decimals).");
  const [whole, fraction = ""] = text.split(".");
  const bps = Number(whole) * 10000 + Number(fraction.padEnd(4, "0"));
  if (bps > MAX_MULTIPLIER_BPS) throw luckyError("Multipliers cannot exceed 1000x.");
  return bps;
}

export function validateLuckyPolicy(input) {
  const poolContributionBps = Math.round(Number(input?.poolContributionPercent) * 100);
  if (!Number.isInteger(poolContributionBps) || poolContributionBps < 0 || poolContributionBps > 10000) throw luckyError("Pool contribution must be between 0% and 100%.");
  const minimum = String(input?.bigWinMinCoins ?? "").trim();
  if (!/^\d{1,15}$/.test(minimum)) throw luckyError("Big-win threshold must be a whole number of Coins.");
  const rows = Array.isArray(input?.multipliers) ? input.multipliers : [];
  if (rows.length < 1 || rows.length > 20) throw luckyError("Add between 1 and 20 multipliers.");
  const seen = new Set();
  const multipliers = rows.map((row) => {
    const multiplierBps = parseMultiplier(row?.multiplier);
    const weight = Number(row?.weight);
    if (!Number.isInteger(weight) || weight < 0 || weight > MAX_WEIGHT) throw luckyError(`Chance weights must be whole numbers from 0 to ${MAX_WEIGHT}.`);
    if (seen.has(multiplierBps)) throw luckyError("Each multiplier can appear only once.");
    seen.add(multiplierBps);
    return { multiplierBps, weight };
  }).sort((a, b) => a.multiplierBps - b.multiplierBps);
  if (!multipliers.some((row) => row.weight > 0)) throw luckyError("At least one multiplier needs a chance above zero.");
  return { poolContributionBps, bigWinMinCoins: BigInt(minimum), multipliers };
}

export function normalizedTable(value) {
  const rows = Array.isArray(value) ? value : luckyDefaults.multipliers;
  const table = rows.filter((row) => Number.isInteger(row?.multiplierBps) && row.multiplierBps >= 0 && Number.isInteger(row?.weight) && row.weight > 0);
  return table.length ? table : luckyDefaults.multipliers;
}

export function expectedReturnBps(table) {
  const rows = normalizedTable(table);
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return Math.round(rows.reduce((sum, row) => sum + row.weight * row.multiplierBps, 0) / total);
}

export function pickMultiplier(table, random = randomInt) {
  const rows = normalizedTable(table);
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let ticket = random(0, total);
  for (const row of rows) { if (ticket < row.weight) return row.multiplierBps; ticket -= row.weight; }
  return rows[rows.length - 1].multiplierBps;
}

export async function luckyPolicy(db) {
  const record = await db.luckyGiftPolicy.findUnique({ where: { id: LUCKY_POLICY_ID } });
  return record
    ? { ...record, multipliers: normalizedTable(record.multipliers), configured: true }
    : { id: LUCKY_POLICY_ID, ...luckyDefaults, version: 0, configured: false };
}

export function luckyPayout(gross, multiplierBps) {
  return (BigInt(gross) * BigInt(multiplierBps)) / 10000n;
}

export function chooseLuckyReward({ gross, poolBalance, table, random = randomInt }) {
  const rolled = pickMultiplier(table, random);
  const rolledCoins = luckyPayout(gross, rolled);
  if (rolledCoins <= poolBalance) return { multiplierBps: rolled, rewardCoins: rolledCoins, limitedByPool: false };
  const affordable = normalizedTable(table).filter((row) => luckyPayout(gross, row.multiplierBps) <= poolBalance);
  if (!affordable.length) return { multiplierBps: 0, rewardCoins: 0n, limitedByPool: true };
  const multiplierBps = pickMultiplier(affordable, random);
  return { multiplierBps, rewardCoins: luckyPayout(gross, multiplierBps), limitedByPool: true };
}

export async function settleLuckyReward(tx, { gross, contribution, policy, random = randomInt }) {
  const [outcome] = await settleLuckyRewards(tx, [{ gross, contribution }], policy, random);
  return outcome;
}

// Equivalent sequential draws against one running balance, but just one read
// and one write for a multi-recipient batch. No separate pool or altered odds.
export async function settleLuckyRewards(tx, entries, policy, random = randomInt, session = null) {
  if (!entries.length) return [];
  // Read the balance in the locking query itself. Existing pools need only
  // this read and the update, not an upsert + lock + separate balance read.
  let pool = session?.pool;
  if (!pool) [pool] = await tx.$queryRaw`SELECT "id", "balance" FROM "LuckyGiftPool" WHERE "id" = ${LUCKY_POLICY_ID} FOR UPDATE`;
  if (!pool) {
    await tx.luckyGiftPool.upsert({ where: { id: LUCKY_POLICY_ID }, update: {}, create: { id: LUCKY_POLICY_ID } });
    [pool] = await tx.$queryRaw`SELECT "id", "balance" FROM "LuckyGiftPool" WHERE "id" = ${LUCKY_POLICY_ID} FOR UPDATE`;
  }
  if (!pool) throw new Error('Lucky pool initialization failed.');
  let balance = pool.balance, collected = 0n, paidOut = 0n;
  const outcomes = entries.map(({ gross, contribution }) => {
    const available = balance + contribution;
    const choice = chooseLuckyReward({ gross, poolBalance: available, table: policy.multipliers, random });
    balance = available - choice.rewardCoins;
    collected += contribution;
    paidOut += choice.rewardCoins;
    return { ...choice, bigWin: choice.rewardCoins > 0n && choice.rewardCoins >= BigInt(policy.bigWinMinCoins) };
  });
  if (session) {
    session.pool = { ...pool, balance };
    session.collected = (session.collected ?? 0n) + collected;
    session.paidOut = (session.paidOut ?? 0n) + paidOut;
  } else {
    await tx.luckyGiftPool.update({
      where: { id: LUCKY_POLICY_ID },
      data: { balance, collected: { increment: collected }, paidOut: { increment: paidOut } },
    });
  }
  return outcomes;
}

// A session belongs to exactly one transaction attempt. The row stays locked
// until commit; flush is mandatory before committing that attempt.
export async function flushLuckyPoolSession(tx, session) {
  if (!session?.pool) return;
  await tx.luckyGiftPool.update({ where: { id: LUCKY_POLICY_ID }, data: {
    balance: session.pool.balance,
    collected: { increment: session.collected }, paidOut: { increment: session.paidOut },
  } });
}
