import { roundTiming } from "./round-timing.mjs";

export function rocketMaxMultiplier(game = {}) { return game.rocketMaxMultiplier ?? 5; }
export function validateRocketSettings(game) {
  const value = rocketMaxMultiplier(game);
  if (!Number.isInteger(value) || value < 1 || value > 10) throw new Error("Rocket maximum multiplier must be a whole number from 1 to 10.");
  return { rocketMaxMultiplier: value };
}
export function rocketTimeline(day, slot) {
  const timing = roundTiming(day.settings);
  const launchesAt = new Date(day.day).getTime() + slot * day.durationMs + timing.selectionSeconds * 1000;
  return { launchesAt, flightMs: timing.playingSeconds * 1000 };
}
export function rocketCrashAt(day, slot, crashCents) {
  const { launchesAt, flightMs } = rocketTimeline(day, slot);
  return launchesAt + Math.ceil(flightMs * crashCents / (rocketMaxMultiplier(day.settings) * 100));
}
export function rocketMultiplierCents(launchesAt, flightMs, now, maxMultiplier = 5) {
  const ROCKET_MAX_CENTS = maxMultiplier * 100;
  return Math.min(ROCKET_MAX_CENTS, Math.max(0, Math.floor((now - launchesAt) * ROCKET_MAX_CENTS / flightMs)));
}
// Never include the future crash point/time in a player snapshot.
export function publicRocketState(day, slot, crashCents, now) {
  const { launchesAt, flightMs } = rocketTimeline(day, slot);
  const crashed = now >= rocketCrashAt(day, slot, crashCents);
  return { crashed, multiplier: (crashed ? crashCents : rocketMultiplierCents(launchesAt, flightMs, now, rocketMaxMultiplier(day.settings))) / 100 };
}
export function rocketCashoutResult(entry, now, crashCents) {
  const { launchesAt, flightMs } = rocketTimeline(entry.day, entry.slot);
  if (now < launchesAt) throw new Error("The rocket has not launched yet.");
  if (now >= rocketCrashAt(entry.day, entry.slot, crashCents)) throw new Error("The rocket has crashed. Cash-out is closed.");
  const cents = rocketMultiplierCents(launchesAt, flightMs, now, rocketMaxMultiplier(entry.day.settings));
  const stake = BigInt(entry.amount), payout = stake * BigInt(cents) / 100n;
  return { currency: entry.input.currency === "COINS" ? "COINS" : "PLAY_POINTS", bet: Number(stake), payout: Number(payout), outcome: payout > stake ? "win" : payout === stake ? "push" : "loss", result: `Cashed out at ${(cents / 100).toFixed(2)}×`, cashedOut: true, cashoutMultiplier: cents / 100, cashoutAt: now };
}
