export const formatCoins = (n) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(typeof n === "string" && /^\d+$/.test(n) ? BigInt(n) : n || 0);
