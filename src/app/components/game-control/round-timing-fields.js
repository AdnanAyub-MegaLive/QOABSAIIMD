"use client";
import { roundTiming } from "@/lib/game-control/round-timing.mjs";

export default function RoundTimingFields({ game, onChange }) {
  const timing = roundTiming(game);
  return <fieldset>
    <legend>Shared round timing</legend>
    <div className="form-grid">
      {[["selectionSeconds", "Selection / betting (seconds)"], ["playingSeconds", "Playing (seconds)"], ["resultSeconds", "Show results (seconds)"]].map(([field, label]) =>
        <label key={field}>{label}<input type="number" min={1} max={3600} step={1} required value={timing[field]} onChange={event => onChange({ [field]: Number(event.target.value) })} /></label>
      )}
    </div>
    <p>Total round: {Object.values(timing).reduce((sum, seconds) => sum + seconds, 0)} seconds. Each phase accepts 1–3600 seconds. Live changes apply at the next midnight UTC; previews use saved settings immediately.</p>
    {game.engine === "rocket" && <p>Playing time is the climb from 0× to {game.rocketMaxMultiplier ?? 5}×. An early crash is shown for the rest of that window plus the results time; the next flight stays on the shared schedule.</p>}
    {game.engine === "trivia" && <p>Playing time covers all five questions.</p>}
    {game.engine === "reaction" && <p>Playing time must allow 5 seconds for the signal plus the reaction target window.</p>}
  </fieldset>;
}
