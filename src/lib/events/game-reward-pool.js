import { tulasiWagersSql } from "../tulasi/activity.js";
// Basis points avoid floating-point drift: 5 bps = 0.05%.
export function gameRewardCoins(total, basisPoints) {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new Error('Invalid game reward rate.');
  const coins = BigInt(total);
  if (coins < 0n) throw new Error('Invalid game reward pool.');
  return coins * BigInt(basisPoints) / 10000n;
}
export async function gameRewardPool(db, {start,end}) {
  const [row] = await db.$queryRaw`SELECT COALESCE(SUM(amount),0)::text AS total FROM (SELECT amount FROM "SharedGameEntry"
    WHERE status='SETTLED' AND input->>'currency'='COINS' AND amount>0
    AND "settledAt">=${start} AND "settledAt"<${end}
    UNION ALL SELECT amount FROM (${tulasiWagersSql(start, end)}) provider) wagers`;
  return BigInt(row.total);
}
