export const WALLET_CURRENCY = process.env.WALLET_CURRENCY || "PKR";

export function walletPublicId(prefix) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export function parsePositiveCoins(value, field = "coins") {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) throw validationError(`${field} must be a positive integer.`);
  const coins = BigInt(text);
  if (coins <= 0n) throw validationError(`${field} must be a positive integer.`);
  return coins;
}

export function integerSetting(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : BigInt(fallback);
}

export function packageAmounts(item) {
  const bonusCoins = (item.coins * BigInt(item.bonusPercent)) / 100n;
  return { bonusCoins, totalCoins: item.coins + bonusCoins };
}

export function serializePackage(item) {
  const { bonusCoins, totalCoins } = packageAmounts(item);
  return {
    id: item.id,
    coins: item.coins.toString(),
    bonusPercent: item.bonusPercent,
    bonusCoins: bonusCoins.toString(),
    totalCoins: totalCoins.toString(),
    price: item.price.toString(),
    bestValue: item.bestValue,
    active: item.active,
  };
}

export function serializeWalletTransaction(item) {
  return {
    id: item.publicId,
    type: item.type,
    direction: item.direction,
    title: item.title,
    description: item.description,
    coins: item.coins?.toString() ?? null,
    diamonds: item.diamonds?.toString() ?? null,
    amount: item.cashAmount?.toString() ?? null,
    currency: item.currency,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
  };
}

export function ledgerData({
  userId,
  type,
  direction,
  title,
  description = null,
  coins = null,
  diamonds = null,
  cashAmount = null,
  currency = null,
  status = "COMPLETED",
  referenceId = null,
  metadata = undefined,
}) {
  return {
    publicId: walletPublicId("TXN"),
    userId,
    type,
    direction,
    title,
    description,
    coins,
    diamonds,
    cashAmount,
    currency,
    status,
    referenceId,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function validationError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  return error;
}
