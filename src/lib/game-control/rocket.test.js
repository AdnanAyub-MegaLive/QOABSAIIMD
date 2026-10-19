import { it, expect, vi } from "vitest";
vi.mock("../prisma.js", () => ({ prisma: {} }));
vi.mock("../mobile-session-state.js", () => ({ assertMobileSession: vi.fn() }));
import { rocketCrashAt, publicRocketState, rocketCashoutResult, rocketMultiplierCents } from "./rocket.mjs";
import { sharedDuration, sharedOutcome, sharedClock } from "./shared-engine.mjs";
import { previewRound } from "./shared-preview.js";
import { validateGame } from "./rules.mjs";
const start = Date.parse("2026-10-19T00:00:00Z");
const game = validateGame({ id: "rocket", name: "Rocket", engine: "rocket", status: "paused", minBet: 10, maxBet: 1000, selectionSeconds: 7, playingSeconds: 20, resultSeconds: 4, outcomeWeights: [0,0,0,0,0,1] });
const day = { day: new Date(start), durationMs: sharedDuration(game), settings: game, seed: "rocket-tests" };
const entry = { day, slot: 0, amount: 101n, input: { currency: "COINS" } };
it("uses configured timing and whole-coin payouts from the server timestamp", () => {
  expect(rocketCrashAt(day, 0, 200)).toBe(start + 15000);
  expect(rocketCrashAt(day, 1, 200)).toBe(start + 46000);
  expect(rocketCashoutResult(entry, start + 15000, 500)).toMatchObject({ cashoutMultiplier: 2, payout: 202, cashedOut: true });
  expect(rocketCashoutResult(entry, start + 9000, 500)).toMatchObject({ cashoutMultiplier: 0.5, payout: 50, outcome: "loss" });
  expect(rocketCashoutResult(entry, start + 7000, 500)).toMatchObject({ cashoutMultiplier: 0, payout: 0, cashedOut: true });
  expect(rocketMultiplierCents(start + 7000, 20000, start + 15039)).toBe(200);
});
it("rejects prelaunch, crash boundary, immediate crashes and 5x crashes", () => {
  expect(() => rocketCashoutResult(entry, start + 6999, 500)).toThrow(/not launched/);
  for (const cents of [0, 1, 199, 200, 499, 500]) {
    const crashAt = rocketCrashAt(day, 0, cents);
    expect(() => rocketCashoutResult(entry, crashAt, cents)).toThrow(/crashed/);
    expect(() => rocketCashoutResult(entry, crashAt + 1, cents)).toThrow(/crashed/);
    if (cents > 0) expect(rocketCashoutResult(entry, crashAt - 1, cents).cashedOut).toBe(true);
  }
});
it("does not disclose the future crash point; all viewers share a deterministic flight", () => {
  expect(sharedOutcome(day, "room", 5)).toEqual(sharedOutcome(structuredClone(day), "room", 5));
  expect(publicRocketState(day, 0, 200, start + 8000)).toEqual(publicRocketState(day, 0, 400, start + 8000));
  expect(publicRocketState(day, 0, 200, start + 15000)).toEqual({ crashed: true, multiplier: 2 });
  expect(sharedClock(day, start + 15000).endsAt).toBe(start + 31000);
});
it("preview prevents duplicate boarding, pays once, and preserves cash-out across a crash", () => {
  const row = { id: "rocket", revision: 1, settings: game }, owner = "rocket-preview";
  const state = previewRound(owner, row, { action: "shared-state" }, start);
  expect(state.outcome).toBeNull(); expect(state.rocket).toEqual({ crashed: false, multiplier: 0 });
  const input = { action: "shared-enter", id: "entry-1", dayId: state.dayId, slot: state.slot, amount: 100, choice: "board" };
  previewRound(owner, row, input, start + 1000);
  expect(() => previewRound(owner, row, { ...input, id: "entry-2" }, start + 2000)).toThrow(/already aboard/);
  const cashout = previewRound(owner, row, { action: "shared-cashout", id: "entry-1" }, start + 15000);
  expect(cashout.result).toMatchObject({ payout: 200, cashoutMultiplier: 2 });
  expect(previewRound(owner, row, { action: "shared-cashout", id: "entry-1" }, start + 28000)).toEqual(cashout);
  expect(previewRound(owner, row, { action: "shared-state" }, start + 28000)).toMatchObject({ availablePoints: "10100", rocket: { crashed: true, multiplier: 5 }, mine: { result: { payout: 200 } } });
});
it("preview never auto-pays at 5x and reveals only after the crash", () => {
  const row = { id: "rocket", revision: 1, settings: game }, owner = "rocket-no-cash";
  const s = previewRound(owner, row, { action: "shared-state" }, start);
  previewRound(owner, row, { action: "shared-enter", id: "aboard", dayId: s.dayId, slot: 0, amount: 100, choice: "board" }, start + 1000);
  expect(previewRound(owner, row, { action: "shared-state" }, start + 26000).outcome).toBeNull();
  expect(() => previewRound(owner, row, { action: "shared-cashout", id: "aboard" }, start + 27000)).toThrow(/crashed/);
  expect(previewRound(owner, row, { action: "shared-state" }, start + 27000)).toMatchObject({ availablePoints: "9900", rocket: { crashed: true, multiplier: 5 }, mine: { result: { payout: 0, cashedOut: false } } });
});
it("supports a saved 10x cap, paying only cash-outs strictly before its crash", () => {
  const ten = validateGame({ ...game, rocketMaxMultiplier: 10, outcomeWeights: [...Array(10).fill(0), 1] });
  const d = { ...day, settings: ten }, e = { ...entry, day: d, amount: 100n };
  expect(sharedOutcome(d, "room", 0).crashCents).toBe(1000);
  expect(rocketCrashAt(d, 0, 1000)).toBe(start + 27000);
  expect(rocketCashoutResult(e, start + 23000, 1000)).toMatchObject({ payout: 800, cashoutMultiplier: 8 });
  expect(() => rocketCashoutResult(e, start + 27000, 1000)).toThrow(/crashed/);
  expect(publicRocketState(d, 0, 1000, start + 23000)).toEqual({ crashed: false, multiplier: 8 });
  expect(sharedOutcome(day, "room", 0).crashCents).toBe(500);
  for (const cap of [0, 11, 5.5, "10", NaN]) expect(() => validateGame({ ...game, rocketMaxMultiplier: cap })).toThrow(/maximum multiplier/);
  expect(() => validateGame({ ...game, rocketMaxMultiplier: 10 })).toThrow(/weights/);
});
it("returns zero at a 10x crash if the player never cashes out", () => {
  const row = { id: "rocket", revision: 1, settings: validateGame({ ...game, rocketMaxMultiplier: 10, outcomeWeights: [...Array(10).fill(0), 1] }) };
  const owner = "ten-crash", s = previewRound(owner, row, { action: "shared-state" }, start);
  previewRound(owner, row, { action: "shared-enter", id: "ten-entry", dayId: s.dayId, slot: 0, amount: 100, choice: "board" }, start + 1000);
  const crashed = previewRound(owner, row, { action: "shared-state" }, start + 27000);
  expect(crashed).toMatchObject({ availablePoints: "9900", rocket: { crashed: true, multiplier: 10 }, mine: { result: { payout: 0, cashedOut: false } } });
});
