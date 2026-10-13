import { prisma } from "./prisma.js";
import { currencyPolicy } from "./currency-policy.js";
import { diamondRules, validateServiceAmount, checkDiamondLimits } from "./diamond-service-rules.js";
import { ledgerData, parsePositiveCoins, validationError } from "./wallet.js";

export async function exchangeSettings(db = prisma, user = {}) {
  const policy=await currencyPolicy(db);
  const rules = diamondRules(policy, user, "EXCHANGE");
  return { ...rules, rules, diamondsPerCoin: BigInt(rules.diamondsPerCoin || 0), minDiamonds: BigInt(rules.minDiamonds || 0), version: policy.version };
}

export function exchangeQuote(value, settings) {
  const requested = parsePositiveCoins(value, "diamonds");
  if (requested > 9223372036854775807n) throw validationError("Diamonds exceed the supported amount.");
  if (requested < settings.minDiamonds) throw new Error("EXCHANGE_BELOW_MINIMUM");
  const coins = requested / settings.diamondsPerCoin;
  if (!coins) throw new Error("EXCHANGE_BELOW_MINIMUM");
  return { requested, coins, used: coins * settings.diamondsPerCoin };
}

export async function exchangeDiamonds(userId, value, key, db = prisma) {
  const requested = parsePositiveCoins(value, "diamonds");
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const referenceId = `DEX:${key}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const previous = await tx.walletTransaction.findUnique({ where: { userId_type_referenceId: { userId, type: "DIAMOND_EXCHANGE_DEBIT", referenceId } } });
        if (previous) {
          if (previous.metadata.requested !== requested.toString()) throw new Error("IDEMPOTENCY_CONFLICT");
          return previous.metadata.result;
        }
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        const settings = await exchangeSettings(tx,user);
        if (!settings.enabled || !user.diamondExchangeEnabled || user.status !== "ACTIVE" || user.deletedAt) throw new Error("EXCHANGE_DISABLED");
        const quote = exchangeQuote(value, settings);
        validateServiceAmount(quote.requested, settings.rules, "EXCHANGE");
        await checkDiamondLimits(tx, userId, quote.used, settings.rules, "EXCHANGE");
        if (quote.requested > user.hostSalaryCoinBalance) throw new Error("INSUFFICIENT_DIAMONDS");
        if (user.coinBalance + quote.coins > 9223372036854775807n) throw validationError("Coin balance would exceed the supported amount.");
        const updated = await tx.user.update({ where: { id: userId }, data: { hostSalaryCoinBalance: { decrement: quote.used }, coinBalance: { increment: quote.coins } } });
        const result = { diamonds: updated.hostSalaryCoinBalance.toString(), coins: updated.coinBalance.toString(), exchangedDiamonds: quote.used.toString(), receivedCoins: quote.coins.toString() };
        const metadata = { requested: requested.toString(), diamondsPerCoin: settings.diamondsPerCoin.toString(), policyVersion:settings.version, result };
        await tx.walletTransaction.createMany({ data: [
          ledgerData({ userId, type: "DIAMOND_EXCHANGE_DEBIT", direction: "DEBIT", title: "Diamonds exchanged", diamonds: quote.used, referenceId, metadata }),
          ledgerData({ userId, type: "DIAMOND_EXCHANGE_CREDIT", direction: "CREDIT", title: "Coins from diamonds", coins: quote.coins, referenceId, metadata }),
        ] });
        return result;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!["P2034", "P2002"].includes(error.code) || attempt === 3) throw error;
    }
  }
}
