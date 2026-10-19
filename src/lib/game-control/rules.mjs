import { validateRocketSettings } from "./rocket.mjs";
import { validateOutcomeWeights } from "./outcome-weights.mjs";
import { validateRoundTiming } from "./round-timing.mjs";
import { validateWeights } from "./roulette/engine.mjs";
import { iconAssetSetting } from "./icon-artwork.js";
import { validateLaunchUrl } from "./catalog.mjs";
import { miniGames } from "./mini-games.mjs";
import { pizzaSettings } from "./pizza.mjs";
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
  if (!["flip", "roulette", "external", ...Object.keys(miniGames)].includes(engine))
    throw new Error("Unknown game engine.");
  if (!["active", "paused"].includes(status))
    throw new Error("Invalid game status.");
  const sortOrder = input.sortOrder ?? 0;
  const iconAssetId = iconAssetSetting(input.iconAssetId);
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000)
    throw new Error("Display order must be a whole number from 0 to 100000.");
  if (engine === "external") return { id, name: name.trim(), engine, status, sortOrder, iconAssetId,
    launchUrl: validateLaunchUrl(input.launchUrl), category: "Room game", color: "purple" };
  const controls={pointReturnMultiplier:input.pointReturnMultiplier??(engine==="dice"?6:2),reactionWindowMs:input.reactionWindowMs??1000,triviaSeconds:input.triviaSeconds??20};
  if(miniGames[engine]){
    if(!Number.isFinite(controls.pointReturnMultiplier)||controls.pointReturnMultiplier<1||controls.pointReturnMultiplier>100||Math.abs(controls.pointReturnMultiplier*100-Math.round(controls.pointReturnMultiplier*100))>1e-7)throw new Error("Point return must be 1–100 with up to two decimal places.");
    if(!Number.isInteger(controls.reactionWindowMs)||controls.reactionWindowMs<100||controls.reactionWindowMs>5000)throw new Error("Reaction window must be 100–5,000 ms.");
    if(!Number.isInteger(controls.triviaSeconds)||controls.triviaSeconds<5||controls.triviaSeconds>120)throw new Error("Trivia time must be 5–120 seconds per question.");
  }
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
    sortOrder,
    iconAssetId,
    name: name.trim(),
    engine,
    status,
    winProbability: engine === "flip" ? winProbability : null,
    payoutMultiplier: engine === "flip" ? payoutMultiplier : null,
    minBet,
    maxBet,
    ...validateRoundTiming(input),
    ...(engine === "rocket" ? validateRocketSettings(input) : {}),
    ...validateOutcomeWeights(input),
    category: engine === "roulette" ? "Table game" : "Instant",
    ...(miniGames[engine]?controls:{}),
    ...(engine==="pizza"?pizzaSettings(input):{}),
    color: engine === "roulette" ? "orange" : "purple",
    ...(engine === "roulette"
      ? { pocketWeights: validateWeights(input.pocketWeights) }
      : {}),
  };
}
export function resolveRound(game, bet, choice, roll) {
  if (game.engine !== "flip") throw new Error("This game does not support coin-flip wagers.");
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
