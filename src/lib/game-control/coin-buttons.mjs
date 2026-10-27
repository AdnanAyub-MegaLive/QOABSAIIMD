export function coinButtons(game = {}) {
  const min = game.minBet ?? 10, max = game.maxBet ?? 1000;
  return [...new Set(game.coinButtons ?? [min, 100, 500, 1000])].filter(n => Number.isSafeInteger(n) && n >= min && n <= max);
}
export function validateCoinButtons(game) {
  if (game.coinButtons === undefined) return coinButtons(game);
  const values = game.coinButtons;
  if (!Array.isArray(values) || values.length < 1 || values.length > 4 || new Set(values).size !== values.length || values.some(n => !Number.isSafeInteger(n) || n < game.minBet || n > game.maxBet))
    throw new Error("Set 1–4 different whole-coin button values within the game's minimum and maximum bet.");
  return [...values];
}
