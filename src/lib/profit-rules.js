import { prisma } from "./prisma.js";

export const GLOBAL_PROFIT_RULE_ID = "GLOBAL";

export async function getProfitSplitRule(client = prisma) {
  return client.profitSplitRule.upsert({
    where: { id: GLOBAL_PROFIT_RULE_ID },
    update: {},
    create: { id: GLOBAL_PROFIT_RULE_ID },
  });
}

export function percentFromBps(value) {
  return Number(value) / 100;
}

export function coinsForShare(grossCoins, basisPoints) {
  return (BigInt(grossCoins) * BigInt(basisPoints)) / 10000n;
}

export function validateProfitSplit(input) {
  const values = {
    hostShareBps: Math.round(Number(input.hostPercent) * 100),
    agencyShareBps: Math.round(Number(input.agencyPercent) * 100),
    companyShareBps: Math.round(Number(input.companyPercent) * 100),
    normalUserReusableShareBps: Math.round(
      Number(input.normalUserReusablePercent) * 100,
    ),
  };
  if (
    Object.values(values).some(
      (value) => !Number.isInteger(value) || value < 0 || value > 10000,
    )
  )
    throw new Error("INVALID_PROFIT_PERCENTAGE");
  if (
    values.hostShareBps +
      values.agencyShareBps +
      values.companyShareBps !==
    10000
  )
    throw new Error("HOST_SPLIT_MUST_TOTAL_100");
  return values;
}
