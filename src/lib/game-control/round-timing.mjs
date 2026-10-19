// Keep legacy schedules unchanged when they have no explicit timing settings.
export function roundTiming(game = {}) {
  return {
    selectionSeconds: game.selectionSeconds ?? 20,
    playingSeconds: game.playingSeconds ?? (game.engine === "trivia" ? 5 * (game.triviaSeconds ?? 20) : 10),
    resultSeconds: game.resultSeconds ?? 10,
  };
}

export function validateRoundTiming(game) {
  const timing = roundTiming(game);
  for (const [field, value] of Object.entries(timing)) {
    if (!Number.isInteger(value) || value < 1 || value > 3600)
      throw new Error(`${field} must be a whole number from 1 to 3600 seconds.`);
  }
  if (game.engine === "reaction" && timing.playingSeconds * 1000 < 5000 + (game.reactionWindowMs ?? 1000))
    throw new Error("Reaction playing time must include 5 seconds for the signal plus the reaction target window.");
  return timing;
}
