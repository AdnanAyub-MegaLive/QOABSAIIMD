// Shared, pure game rules used by BOTH the client (for rendering the wheel /
// UI) and the server API routes (for the authoritative result + payout
// calculation). Keeping this in one place means the client can never drift
// from what the server actually decided.

export const wheelOrder = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const redNumbers = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const chips = [5, 10, 25, 50, 100];

export const bets = [
  { label: "0", payout: "x36", multiplier: 36, detail: "Green zero", tone: "green" },
  { label: "1-12", payout: "x3", multiplier: 3, detail: "First dozen" },
  { label: "13-24", payout: "x3", multiplier: 3, detail: "Second dozen" },
  { label: "25-36", payout: "x3", multiplier: 3, detail: "Third dozen" },
  { label: "Red", payout: "x2", multiplier: 2, detail: "Red pockets", tone: "red" },
  { label: "Black", payout: "x2", multiplier: 2, detail: "Black pockets", tone: "dark" },
  { label: "Odd", payout: "x2", multiplier: 2, detail: "Odd numbers", tone: "green" },
  { label: "Even", payout: "x2", multiplier: 2, detail: "Even numbers", tone: "green" },
];

export const betByLabel = Object.fromEntries(bets.map((bet) => [bet.label, bet]));

export const STARTING_BALANCE = 3250;
export const MAX_BET_PER_MARKET = 100000; // sanity ceiling, not a real product limit

export function resultColor(number) {
  if (number === 0) return "Green";
  return redNumbers.has(number) ? "Red" : "Black";
}

export function isBetWinner(label, number) {
  switch (label) {
    case "0":
      return number === 0;
    case "1-12":
      return number >= 1 && number <= 12;
    case "13-24":
      return number >= 13 && number <= 24;
    case "25-36":
      return number >= 25 && number <= 36;
    case "Red":
      return redNumbers.has(number);
    case "Black":
      return number > 0 && !redNumbers.has(number);
    case "Odd":
      return number > 0 && number % 2 === 1;
    case "Even":
      return number > 0 && number % 2 === 0;
    default:
      return false;
  }
}

/**
 * Validates a client-submitted bet map before the server trusts it for
 * anything. Every amount must be a positive integer, a whole multiple of
 * some real chip value is not enforced (players can combine chips), and
 * every label must be a real market -- this closes off a client sending a
 * fabricated label or a negative/NaN amount to manipulate the payout sum.
 */
export function sanitizeBets(rawBets) {
  const clean = {};
  if (!rawBets || typeof rawBets !== "object") return clean;
  for (const [label, amount] of Object.entries(rawBets)) {
    if (!betByLabel[label]) continue;
    const num = Number(amount);
    if (!Number.isInteger(num) || num <= 0 || num > MAX_BET_PER_MARKET) continue;
    clean[label] = num;
  }
  return clean;
}

export function settleRound(sanitizedBets, winningNumber) {
  const wagered = Object.values(sanitizedBets).reduce((sum, amount) => sum + amount, 0);
  const payout = Object.entries(sanitizedBets).reduce((sum, [label, amount]) => {
    if (!isBetWinner(label, winningNumber)) return sum;
    return sum + amount * betByLabel[label].multiplier;
  }, 0);
  return { wagered, payout, net: payout - wagered };
}
