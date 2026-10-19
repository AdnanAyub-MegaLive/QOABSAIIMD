import { rocketMaxMultiplier } from "./rocket.mjs";
const range = count => Array.from({ length: count }, (_, i) => i);
const group = (label, draws) => ({ label, draws, weight: draws.length });
export const outcomeOptions = {
  rocket: [...range(5).map(n=>group(`Crash ${n}.00–${n}.99×`, range(100).map(i=>n*100+i))), group("Crash at 5.00×", [500])],
  highlow: [group("Low (1–3)", [0, 1, 2]), group("High (4–6)", [3, 4, 5])],
  wheel: [group("0× — loss", range(12)), group("1× — stake returned", [12, 13, 14, 15]), group("2×", [16, 17]), group("3×", [18]), group("8×", [19])],
  dragon: [group("Dragon wins", range(169).filter(n => Math.floor(n / 13) > n % 13)), group("Tiger wins", range(169).filter(n => Math.floor(n / 13) < n % 13)), group("Tie — stake returned", range(169).filter(n => Math.floor(n / 13) === n % 13))],
  slots: [3, 2, 1].map((size, i) => group(["No match — loss", "Pair — stake returned", "Triple — 6×"][i], range(64).filter(n => new Set([Math.floor(n / 16), Math.floor(n / 4) % 4, n % 4]).size === size))),
  dice: range(6).map(n => group(`Face ${n + 1}`, [n])),
  rps: ["Opponent rock", "Opponent paper", "Opponent scissors"].map((label, n) => group(label, [n])),
  penalty: ["Keeper left", "Keeper centre", "Keeper right"].map((label, n) => group(label, [n])),
  teenpatti: ["Hand 1 wins", "Hand 2 wins", "Hand 3 wins"].map((label, n) => group(label, [n])),
};
export function optionsForGame(game) {
  if(game.engine !== "rocket") return outcomeOptions[game.engine];
  const max = rocketMaxMultiplier(game);
  return [...range(max).map(n=>group(`Crash ${n}.00–${n}.99×`, range(100).map(i=>n*100+i))), group(`Crash at ${max}.00×`, [max*100])];
}
export function outcomeWeights(game) {
  return game.outcomeWeights ?? optionsForGame(game)?.map(option => option.weight);
}
export function validateOutcomeWeights(game) {
  const options = optionsForGame(game);
  if (!options || game.outcomeWeights === undefined) return {};
  const weights = game.outcomeWeights;
  if (!Array.isArray(weights) || weights.length !== options.length || weights.some(n => !Number.isInteger(n) || n < 0 || n > 10000) || weights.reduce((a, b) => a + b, 0) === 0)
    throw new Error(`Outcome weights must contain ${options.length} whole numbers from 0 to 10000, with at least one positive weight.`);
  return { outcomeWeights: [...weights] };
}
export function weightedOutcomeDraw(game, random) {
  const options = optionsForGame(game), weights = outcomeWeights(game);
  let ticket = random(weights.reduce((a, b) => a + b, 0));
  const index = weights.findIndex(weight => (ticket -= weight) < 0);
  const draws = options[index].draws;
  return draws[random(draws.length)];
}
export function outcomeOddsText(game) {
  const options = optionsForGame(game);
  if (!options) return "";
  const weights = outcomeWeights(game), total = weights.reduce((a, b) => a + b, 0);
  return `${game.engine === "teenpatti" ? "Non-tied deals only; tied deals remain unchanged. " : ""}${options.map((option, i) => `${option.label}: ${(weights[i] / total * 100).toFixed(2)}%`).join(" · ")}`;
}
// Rules describe payouts independently from the configured distribution.
export const configurableRules = {
  teenpatti: "Choose Hand 1, 2 or 3. The strongest three-card hand wins. Configured weights determine the winning position on non-tied deals; all tied strongest hands win.",
  highlow: "Low wins on 1–3; High on 4–6. A win returns 1.9× your stake. Faces within each group are equally likely.",
  wheel: "The shared spin pays 0×, 1×, 2×, 3× or 8×. A 1× result returns your stake. Sector sizes do not represent configured probabilities.",
  dragon: "The higher rank wins at 1.9×. Equal ranks return your stake. Rank pairs within each outcome group are equally likely.",
  slots: "Three matching symbols pay 6×; exactly two matching return your stake; no match loses. Combinations within each outcome group are equally likely.",
};
