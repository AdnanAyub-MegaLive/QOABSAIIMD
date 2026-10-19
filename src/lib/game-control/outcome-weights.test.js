import { it, expect, vi } from "vitest";
vi.mock("../prisma.js", () => ({ prisma: {} }));
vi.mock("../mobile-session-state.js", () => ({ assertMobileSession: vi.fn() }));
import { outcomeOptions, validateOutcomeWeights, weightedOutcomeDraw, outcomeOddsText } from "./outcome-weights.mjs";
import { sharedOutcome } from "./shared-engine.mjs";
import { resolveSharedEntry } from "./shared-games.js";
import { validateGame } from "./rules.mjs";
import { previewRound } from "./shared-preview.js";
const start = Date.parse("2026-10-18T00:00:00Z");
const settings = engine => ({ id: `test-${engine}`, name: engine, engine, status: "paused", minBet: 10, maxBet: 1000 });
const dayFor = game => ({ day: new Date(start), durationMs: 40000, seed: "weighted-test", settings: game });
for (const [engine, options] of Object.entries(outcomeOptions)) {
  it(`${engine} maps every ticket to exactly its configured outcome group`, () => {
    const weights = options.map((_, i) => i + 1), total = weights.reduce((a, b) => a + b, 0), counts = options.map(() => 0);
    for (let ticket = 0; ticket < total; ticket++) {
      let call = 0;
      const draw = weightedOutcomeDraw({ engine, outcomeWeights: weights }, max => { const n = call++ === 0 ? ticket : 0; expect(n).toBeLessThan(max); return n; });
      counts[options.findIndex(option => option.draws.includes(draw))]++;
    }
    expect(counts).toEqual(weights);
  });
  it(`${engine} validates weights and retains original config when omitted`, () => {
    expect(validateGame(settings(engine)).outcomeWeights).toBeUndefined();
    const weights = options.map(() => 1);
    expect(validateGame({ ...settings(engine), outcomeWeights: weights }).outcomeWeights).toEqual(weights);
    for (const bad of [null, [], options.map(() => 0), weights.map((n, i) => i ? n : -1), weights.map((n, i) => i ? n : 0.5), weights.map((n, i) => i ? n : 10001)])
      expect(() => validateOutcomeWeights({ engine, outcomeWeights: bad })).toThrow(/weights/);
  });
  it(`${engine} honors exclusive weights and stays deterministic across viewers`, () => {
    for (let index = 0; index < options.length; index++) {
      const game = { ...settings(engine), outcomeWeights: options.map((_, i) => i === index ? 1 : 0) }, day = dayFor(game);
      for (let slot = 0; slot < 20; slot++) {
        const outcome = sharedOutcome(day, "room", slot);
        expect(sharedOutcome(structuredClone(day), "room", slot)).toEqual(outcome);
        if (engine === "rocket") expect(options[index].draws).toContain(outcome.crashCents);
        else if (outcome.draw !== undefined) expect(options[index].draws).toContain(outcome.draw);
        else if (engine === "teenpatti") {
          if (outcome.winners.length === 1) expect(outcome.winners).toEqual([String(index + 1)]);
          expect(new Set(outcome.hands.flatMap(hand => hand.cards)).size).toBe(9);
        } else expect(outcome.result).toBe(engine === "dice" ? String(index + 1) : (engine === "rps" ? ["rock", "paper", "scissors"] : ["left", "centre", "right"])[index]);
      }
    }
  });
}
it("uses one shared weighted outcome for opposing bets", () => {
  const day = dayFor({ ...settings("highlow"), outcomeWeights: [0, 100] });
  const entry = { day, roomId: "room", slot: 1, amount: 100n, input: { currency: "COINS", choice: "high" } };
  expect(resolveSharedEntry(entry)).toMatchObject({ outcome: "win", payout: 190 });
  expect(resolveSharedEntry({ ...entry, input: { ...entry.input, choice: "low" } })).toMatchObject({ outcome: "loss", payout: 0 });
});
it("previews saved weighted payouts and resets when the revision changes", () => {
  const game = { ...settings("wheel"), outcomeWeights: [0, 0, 0, 0, 1] }, row = { id: game.id, revision: 1, settings: validateGame(game) };
  const state = previewRound("weighted-preview", row, { action: "shared-state" }, start);
  previewRound("weighted-preview", row, { action: "shared-enter", id: "spin-1", dayId: state.dayId, slot: state.slot, amount: 100, choice: "spin" }, start + 1000);
  expect(previewRound("weighted-preview", row, { action: "shared-state" }, start + 30000)).toMatchObject({ outcome: { result: "8×" }, mine: { result: { payout: 800 } } });
  const updated = { ...row, revision: 2, settings: validateGame({ ...game, outcomeWeights: [1, 0, 0, 0, 0] }) };
  expect(previewRound("weighted-preview", updated, { action: "shared-state" }, start + 30000).outcome.result).toBe("0×");
});
it("shows configured percentages including returned stakes separately", () => {
  expect(outcomeOddsText({ engine: "slots", outcomeWeights: [50, 40, 10] })).toContain("Triple — 6×: 10.00%");
  expect(outcomeOddsText({ engine: "slots", outcomeWeights: [50, 40, 10] })).toContain("Pair — stake returned: 40.00%");
});
