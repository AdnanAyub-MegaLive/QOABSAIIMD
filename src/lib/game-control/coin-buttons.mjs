export function coinButtons(game = {}) {
  const min = game.minBet ?? 10;
  return [...new Set(game.coinButtons ?? [min, 100, 500, 1000])].filter(n => Number.isSafeInteger(n) && n >= 1);
}
export function validateCoinButtons(game) {
  if (game.coinButtons === undefined) return coinButtons(game);
  const values = game.coinButtons;
  if (!Array.isArray(values) || values.length < 1 || values.length > 4 || new Set(values).size !== values.length || values.some(n => !Number.isSafeInteger(n) || n < 1))
    throw new Error("Set 1–4 different whole-coin button values greater than zero.");
  return [...values];
}
