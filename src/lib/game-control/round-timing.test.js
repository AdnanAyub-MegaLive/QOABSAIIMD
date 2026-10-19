import { describe, it, expect, vi } from "vitest";
vi.mock("../prisma.js", () => ({ prisma: {} }));
vi.mock("../mobile-session-state.js", () => ({ assertMobileSession: vi.fn() }));
import { roundTiming, validateRoundTiming } from "./round-timing.mjs";
import { sharedClock, sharedDuration, sharedOutcome, DAY_MS } from "./shared-engine.mjs";
import { resolveSharedEntry } from "./shared-games.js";
import { validateGame } from "./rules.mjs";
import { previewRound } from "./shared-preview.js";
const start = Date.parse("2026-10-18T00:00:00Z");
const custom = { selectionSeconds: 7, playingSeconds: 12, resultSeconds: 4 };
const game = { id: "flip", name: "Lucky Flip", engine: "flip", status: "paused", minBet: 10, maxBet: 1000, winProbability: 100, payoutMultiplier: 2, ...custom };
describe("configurable round timing", () => {
  it("preserves legacy defaults including trivia", () => {
    expect(roundTiming({ engine: "flip" })).toEqual({ selectionSeconds: 20, playingSeconds: 10, resultSeconds: 10 });
    expect(sharedDuration({ engine: "trivia", triviaSeconds: 20 })).toBe(130000);
  });
  it.each([0, -1, 1.5, 3601, Infinity, "10"])("rejects invalid phase duration %s", value => {
    for (const field of Object.keys(custom)) expect(() => validateRoundTiming({ ...custom, [field]: value })).toThrow(/whole number/);
  });
  it("validates and persists custom timing on game settings", () => {
    expect(validateGame(game)).toMatchObject(custom);
    expect(validateRoundTiming({ selectionSeconds: 1, playingSeconds: 3600, resultSeconds: 1 })).toMatchObject({ playingSeconds: 3600 });
    expect(() => validateGame({ ...game, playingSeconds: 0 })).toThrow();
    expect(() => validateRoundTiming({ engine: "reaction", playingSeconds: 5 })).toThrow(/Reaction/);
    expect(validateRoundTiming({ engine: "reaction", playingSeconds: 6 }).playingSeconds).toBe(6);
  });
  it("uses saved phase boundaries and avoids truncated rounds at midnight", () => {
    const day = { day: new Date(start), settings: game, durationMs: sharedDuration(game) };
    expect(day.durationMs).toBe(23000);
    expect(sharedClock(day, start + 6999).phase).toBe("open");
    expect(sharedClock(day, start + 7000).phase).toBe("playing");
    expect(sharedClock(day, start + 19000).phase).toBe("reveal");
    expect(sharedClock(day, start + 23000)).toMatchObject({ phase: "open", slot: 1 });
    expect(sharedClock(day, start + DAY_MS - 1).phase).toBe("reset");
  });
  it("settles reaction taps relative to the configured selection window", () => {
    const settings = { engine: "reaction", reactionWindowMs: 1000, ...custom };
    const day = { day: new Date(start), settings, durationMs: sharedDuration(settings), seed: "timing-test" };
    const delay = sharedOutcome(day, "room", 2).delayMs;
    const entry = { day, roomId: "room", slot: 2, input: { currency: "COINS" }, amount: 100, answer: { at: start + 2 * day.durationMs + 7000 + delay + 100 } };
    expect(resolveSharedEntry(entry)).toMatchObject({ outcome: "win", payout: 200, result: "100 ms" });
    expect(resolveSharedEntry({ ...entry, answer: { at: entry.answer.at - 200 } }).outcome).toBe("loss");
  });
  it("closes preview betting and settles at custom times", () => {
    const row = { id: "flip", revision: 1, settings: validateGame(game) };
    const owner = "custom-timing";
    const state = previewRound(owner, row, { action: "shared-state" }, start);
    const entry = { action: "shared-enter", id: "custom-bet", dayId: state.dayId, slot: state.slot, amount: 100, choice: "heads" };
    previewRound(owner, row, entry, start + 6000);
    expect(() => previewRound(owner, row, { ...entry, id: "late-bet" }, start + 7000)).toThrow(/closed/);
    expect(previewRound(owner, row, { action: "shared-state" }, start + 18000).mine.status).toBe("PENDING");
    expect(previewRound(owner, row, { action: "shared-state" }, start + 19000)).toMatchObject({ phase: "reveal", availablePoints: "10100", mine: { status: "SETTLED" } });
  });
});
