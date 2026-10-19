"use client";
import { optionsForGame, outcomeWeights } from "@/lib/game-control/outcome-weights.mjs";
export default function OutcomeWeightFields({ game, onChange }) {
  const displayGame = game.engine === "rocket" && (!Number.isInteger(game.rocketMaxMultiplier ?? 5) || (game.rocketMaxMultiplier ?? 5) < 1 || game.rocketMaxMultiplier > 10) ? {...game,rocketMaxMultiplier:5,outcomeWeights:undefined} : game;
  const options = optionsForGame(displayGame);
  if (!options) return <p>Winning depends on {game.engine === "trivia" ? "correct answers" : "reaction timing"}; there is no random win probability.</p>;
  const weights = outcomeWeights(displayGame), total = weights.reduce((a, b) => a + b, 0);
  return <fieldset><legend>Winning probabilities / outcome weights</legend>
    {game.engine === "rocket" && <label>Maximum multiplier (1–10×)<input type="number" min={1} max={10} step={1} required value={game.rocketMaxMultiplier ?? 5} onChange={event => {
      const max = Number(event.target.value);
      onChange({ rocketMaxMultiplier: max, outcomeWeights: undefined });
    }} /><small>Changing the maximum resets crash weights to equal chances per 0.01× level. Set the weights below before saving.</small></label>}
    <p>Chance = weight ÷ total weight. Set a weight to 0 to disable that outcome. These control the shared room result; each player’s winning chance depends on their choice. Live changes apply next midnight UTC; saved previews update immediately.</p>
    {game.engine === "rocket" && <p>These are crash-range probabilities, not player win rates. Each 0.01× level within a range is equally likely. A crash at 0× is immediate; the configured maximum is also a crash, not an automatic payout.</p>}
    {game.engine === "teenpatti" && <p>Weights choose the winning hand position on non-tied deals. Card strength determines the winner; tied deals keep their original positions and rules.</p>}
    <div className="form-grid">{options.map((option, i) => <label key={option.label}>{option.label} — {total ? (weights[i] / total * 100).toFixed(2) : "0.00"}%
      <input aria-label={`${option.label} weight`} type="number" min={0} max={10000} step={1} required value={weights[i]} onChange={event => onChange({ outcomeWeights: weights.map((weight, j) => j === i ? Number(event.target.value) : weight) })} />
    </label>)}</div>
    {!total && <p role="alert">At least one outcome must have a positive weight.</p>}
    <button type="button" className="button" onClick={() => onChange({ outcomeWeights: options.map(option => option.weight) })}>Reset to original probabilities</button>
  </fieldset>;
}
