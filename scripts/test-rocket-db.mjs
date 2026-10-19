// Isolated database only: exercises the real PostgreSQL locks and wallet ledger.
import { config } from "dotenv";
import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const base = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(base.hostname)) throw new Error("Rocket DB checks require local PostgreSQL.");
const name = `megalive_rocket_test_${randomUUID().replaceAll("-", "")}`;
base.pathname = "/postgres";
const admin = new Client({ connectionString: base.toString() });
await admin.connect();
let prisma, created = false;
const realNow = Date.now;
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  base.pathname = `/${name}`; process.env.DATABASE_URL = base.toString();
  const push = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push"], { env: process.env, encoding: "utf8" });
  if (push.status !== 0) throw new Error(push.stderr || push.stdout);
  ({ prisma } = await import("../src/lib/prisma.js"));
  const { ensureGames, saveGame } = await import("../src/lib/game-control/service.js");
  const { sharedSnapshot, enterSharedRound, cashOutRocket, settleSharedGames } = await import("../src/lib/game-control/shared-games.js");
  const { sharedOutcome } = await import("../src/lib/game-control/shared-engine.mjs");
  await ensureGames();
  assert.equal(await prisma.gameDefinition.count(), 14);
  const user = await prisma.user.create({ data: { publicId: "USR-ROCKET-TEST", name: "Rocket test", coinBalance: 10000n } });
  const other = await prisma.user.create({ data: { publicId: "USR-ROCKET-OTHER", name: "Other test", coinBalance: 10000n } });
  const room = await prisma.audioRoom.create({ data: { roomId: "ROCKET-TEST", ownerId: user.id, title: "Rocket test" } });
  for (const u of [user, other]) await prisma.audioRoomMember.create({ data: { audioRoomId: room.id, userId: u.id, socketCount: 1 } });
  const identityFor = u => ({ userId: u.id, roomId: room.roomId, claims: { userId: u.publicId, sessionVersion: 0, issuedAt: realNow(), exp: 4070908800 }, expiresAt: new Date("2099-01-01") });
  const identity = identityFor(user);
  const settings = { id: "rocket", name: "Rocket", engine: "rocket", status: "active", minBet: 10, maxBet: 1000, revision: 1, outcomeWeights: [0,0,0,0,0,1] };
  await saveGame(settings, "Rocket integration check");
  // Keep test rounds ahead of the actual wall clock so snapshot's real-time
  // background settlement cannot settle them before our controlled timestamps.
  const dayStart = Math.floor(realNow() / 86400000) * 86400000;
  const slot = Math.floor((realNow() - dayStart) / 40000) + 2;
  assert(slot < 2150, "Run before the final seven minutes of the UTC day.");
  const start = dayStart + slot * 40000;
  Date.now = () => start + 1000;
  const state = await sharedSnapshot(identity, { gameId: "rocket" });
  assert.equal(state.outcome, null); assert.deepEqual(state.rocket, { crashed: false, multiplier: 0 });
  assert(!JSON.stringify(state.rocket).includes("crashCents"), "No future crash in current-flight snapshot");
  const wager = { id: randomUUID(), gameId: "rocket", dayId: state.dayId, slot: state.slot, amount: 100, choice: "board" };
  const [first, retry] = await Promise.all([enterSharedRound(identity, wager), enterSharedRound(identity, wager)]);
  assert.equal(first.id, retry.id);
  await assert.rejects(enterSharedRound(identity, { ...wager, id: randomUUID() }), /already aboard/);
  await assert.rejects(cashOutRocket(identity, wager), /not launched/);
  await assert.rejects(cashOutRocket(identityFor(other), wager), /not found/);
  await assert.rejects(cashOutRocket({ ...identity, roomId: "WRONG" }, wager), /not found/);
  Date.now = () => start + 24000;
  const [cash, duplicate] = await Promise.all([cashOutRocket(identity, { ...wager, multiplier: 999, payout: 999999 }), cashOutRocket(identity, wager)]);
  assert.deepEqual(cash, duplicate); assert.equal(cash.result.payout, 200); assert.equal(cash.result.cashoutMultiplier, 2);
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).coinBalance, 10100n);
  assert.equal(await prisma.walletTransaction.count({ where: { referenceId: wager.id } }), 2);
  await settleSharedGames(prisma, new Date(start + 31000));
  assert.equal((await cashOutRocket(identity, wager)).result.payout, 200);
  assert.equal(await prisma.gameRound.count(), 1); assert.equal(await prisma.gameLog.count(), 1);
  // A second player's flight loses at exactly 5x. No auto-cash-out.
  Date.now = () => start + 1000;
  const lose = { ...wager, id: randomUUID() };
  await enterSharedRound(identityFor(other), lose);
  Date.now = () => start + 30000;
  await assert.rejects(cashOutRocket(identityFor(other), lose), /crashed/);
  await settleSharedGames(prisma, new Date(start + 30000));
  assert.equal((await prisma.sharedGameEntry.findUnique({ where: { id: lose.id } })).result.payout, 0);
  assert.equal((await prisma.user.findUnique({ where: { id: other.id } })).coinBalance, 9900n);
  // A later round: payout failure must roll back balance and status, then retry.
  Date.now = () => start + 41000;
  const s2 = await sharedSnapshot(identity, { gameId: "rocket" });
  const fail = { ...wager, id: randomUUID(), slot: s2.slot };
  await enterSharedRound(identity, fail);
  await prisma.gameLog.create({ data: { userId: user.id, gameName: "Rollback fixture", wager: 0n, payout: 0n, result: "test", referenceId: fail.id } });
  Date.now = () => start + 64000;
  const balanceBefore = (await prisma.user.findUnique({ where: { id: user.id } })).coinBalance;
  await assert.rejects(cashOutRocket(identity, fail));
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).coinBalance, balanceBefore);
  assert.equal((await prisma.sharedGameEntry.findUnique({ where: { id: fail.id } })).status, "PENDING");
  assert.equal(await prisma.walletTransaction.count({ where: { referenceId: fail.id, direction: "CREDIT" } }), 0);
  await prisma.gameLog.delete({ where: { referenceId: fail.id } });
  // Pause blocks boarding, but an existing flight remains visible and cashable.
  await saveGame({ ...settings, revision: 2, status: "paused", outcomeWeights: [1,0,0,0,0,0] }, "Rocket integration check");
  const paused = await sharedSnapshot(identity, { gameId: "rocket" });
  assert.equal(paused.acceptingBets, false); assert.equal(paused.outcome, null);
  const savedDay = await prisma.sharedGameDay.findUnique({ where: { id: state.dayId } });
  assert.equal(sharedOutcome(savedDay, room.roomId, s2.slot).crashCents, 500, "Existing daily schedule remains immutable");
  const beforeCrash = await cashOutRocket(identity, fail); assert.equal(beforeCrash.result.payout, 200);
  // Competing settlement and retry must not pay again.
  Date.now = () => start + 70000;
  await Promise.all([settleSharedGames(prisma, new Date(start + 70000)), cashOutRocket(identity, fail)]);
  assert.equal(await prisma.walletTransaction.count({ where: { referenceId: fail.id, direction: "CREDIT" } }), 1);
  const ledger = await prisma.walletTransaction.findMany({ where: { userId: user.id } });
  const delta = ledger.reduce((sum, row) => sum + (row.direction === "CREDIT" ? row.coins : -row.coins), 0n);
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).coinBalance, 10000n + delta);
  console.log("PASS: Rocket catalog, shared snapshot privacy, boarding replay, duplicate boarding, ownership, prelaunch/5x rejection, server-calculated payouts, concurrent cash-outs, crash losses, rollback, pause handling, immutable schedule, settlement retry and wallet reconciliation.");
} finally {
  Date.now = realNow;
  await prisma?.$disconnect();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
