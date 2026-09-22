import { validateWeights } from "./roulette/engine.mjs";
export function validateGame(input) {
  if (!input || typeof input !== "object")
    throw new Error("Game settings are required.");
  const {
    id,
    name,
    engine,
    status,
    winProbability,
    payoutMultiplier,
    minBet,
    maxBet,
  } = input;
  if (typeof id !== "string" || !/^[a-z][a-z0-9-]{2,49}$/.test(id))
    throw new Error(
      "Game ID must be 3–50 lowercase letters, numbers or hyphens.",
    );
  if (
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 60
  )
    throw new Error("Game name must be 2–60 characters.");
  if (!["flip", "roulette"].includes(engine))
    throw new Error("Unknown game engine.");
  if (!["active", "paused"].includes(status))
    throw new Error("Invalid game status.");
  if (
    engine === "flip" &&
    (!Number.isFinite(winProbability) ||
      winProbability < 0 ||
      winProbability > 100 ||
      Math.abs(winProbability * 100 - Math.round(winProbability * 100)) > 1e-7)
  )
    throw new Error(
      "Win probability must be between 0 and 100, with at most 2 decimal places.",
    );
  if (
    engine === "flip" &&
    (!Number.isFinite(payoutMultiplier) ||
      payoutMultiplier < 1 ||
      payoutMultiplier > 100 ||
      Math.abs(payoutMultiplier * 100 - Math.round(payoutMultiplier * 100)) >
        1e-7)
  )
    throw new Error("Payout must be 1–100× with at most 2 decimal places.");
  if (
    !Number.isSafeInteger(minBet) ||
    !Number.isSafeInteger(maxBet) ||
    minBet < 1 ||
    maxBet < minBet ||
    maxBet > 1000000
  )
    throw new Error(
      "Bet limits must be whole coins from 1 to 1,000,000; maximum must be at least minimum.",
    );
  return {
    id,
    name: name.trim(),
    engine,
    status,
    winProbability: engine === "flip" ? winProbability : null,
    payoutMultiplier: engine === "flip" ? payoutMultiplier : null,
    minBet,
    maxBet,
    category: engine === "roulette" ? "Table game" : "Instant",
    color: engine === "roulette" ? "orange" : "purple",
    ...(engine === "roulette"
      ? { pocketWeights: validateWeights(input.pocketWeights) }
      : {}),
  };
}
export function resolveRound(game, bet, choice, roll) {
  validateGame(game);
  if (game.status !== "active") throw new Error("This game is paused.");
  if (!Number.isSafeInteger(bet) || bet < game.minBet || bet > game.maxBet)
    throw new Error(`Bet must be ${game.minBet}–${game.maxBet} whole coins.`);
  if (!["heads", "tails"].includes(choice))
    throw new Error("Choose heads or tails.");
  if (!Number.isInteger(roll) || roll < 0 || roll >= 10000)
    throw new Error("Invalid random draw.");
  const won = roll < Math.round(game.winProbability * 100);
  const payout = won
    ? Math.floor((bet * Math.round(game.payoutMultiplier * 100)) / 100)
    : 0;
  return {
    bet,
    payout,
    outcome: won ? "win" : "loss",
    choice,
    result: won ? choice : choice === "heads" ? "tails" : "heads",
    winProbability: game.winProbability,
    payoutMultiplier: game.payoutMultiplier,
    revision: game.revision,
  };
}
export function summary(rounds) {
  const settled = rounds.filter((r) => r.status === "settled");
  const bets = settled.reduce((s, r) => s + r.bet, 0),
    payouts = settled.reduce((s, r) => s + r.payout, 0);
  return {
    bets,
    payouts,
    revenue: bets - payouts,
    rounds: settled.length,
    wins: settled.filter((r) => r.outcome === "win").length,
    players: new Set(settled.map((r) => r.uid)).size,
  };
}
