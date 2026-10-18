import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ tx: null }));
vi.mock("../prisma.js", () => ({ prisma: { $transaction: fn => fn(state.tx) } }));
vi.mock("../mobile-session-state.js", () => ({ assertMobileSession: vi.fn() }));
import { placeRound, startChallenge } from "./service.js";
const identity = { userId: "u", roomId: "ROOM-1", expiresAt: new Date("2099-01-01"), claims: { userId: "USR-1", exp: 4070908800 } };
const request = { id: "12345678-1234-4234-8234-123456789abc", gameId: "lucky-flip", revision: 1, bet: 100, choice: "heads" };
let rows, points;
beforeEach(() => {
  rows = new Map(); points = 10000n;
  state.tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: async () => ({ id: "u", publicId: "USR-1", name: "Test", coinBalance: 0n }), update: vi.fn() },
    walletTransaction: { createMany: vi.fn() }, gameLog: { create: vi.fn() }, gameRound: { create: vi.fn() }, activityLevelAward: { create: vi.fn() },
    gameDefinition: { findUnique: async () => ({ id: "lucky-flip", revision: 1, settings: { id: "lucky-flip", name: "Lucky Flip", engine: "flip", status: "active", minBet: 10, maxBet: 1000, winProbability: 100, payoutMultiplier: 2 } }) },
    gamePlayAccount: { upsert: async () => ({ points }), update: vi.fn(async ({ data }) => { points = data.points; }) },
    gamePlayRound: { findUnique: async ({ where }) => rows.get(where.id), create: vi.fn(async ({ data }) => { rows.set(data.id, data); }) },
  };
});
it("plays with zero wallet Coins and never touches financial or XP records", async () => {
  const round = await placeRound(identity, request);
  expect(round).toMatchObject({ currency: "PLAY_POINTS", availablePoints: "10100", payout: 200 });
  for (const fn of [state.tx.user.update, state.tx.walletTransaction.createMany, state.tx.gameLog.create, state.tx.gameRound.create, state.tx.activityLevelAward.create]) expect(fn).not.toHaveBeenCalled();
});
it("replays the same operation and rejects conflicting payloads", async () => {
  const first = await placeRound(identity, request);
  expect(await placeRound(identity, request)).toEqual(first);
  expect(state.tx.gamePlayAccount.update).toHaveBeenCalledTimes(1);
  await expect(placeRound(identity, { ...request, bet: 200 })).rejects.toThrow("different wager");
});
it("rejects insufficient points without recording a round", async () => {
  points = 0n;
  await expect(placeRound(identity, request)).rejects.toThrow("free points");
  expect(rows.size).toBe(0);
});
it("keeps pause and session checks", async () => {
  await expect(placeRound({ ...identity, expiresAt: new Date(0) }, request)).rejects.toThrow("expired");
  const original = state.tx.gameDefinition.findUnique;
  state.tx.gameDefinition.findUnique = async () => { const row = await original(); row.settings.status = "paused"; return row; };
  await expect(placeRound(identity, request)).rejects.toThrow("paused");
});
it("roulette also settles only free points", async () => {
  state.tx.gameDefinition.findUnique = async () => ({ id: "roulette", revision: 1, settings: { id: "roulette", name: "Roulette", engine: "roulette", status: "active", minBet: 10, maxBet: 1000, pocketWeights: [1, ...Array(36).fill(0)] } });
  const round = await placeRound(identity, { ...request, gameId: "roulette", bets: { "0": 100 } });
  expect(round).toMatchObject({ currency: "PLAY_POINTS", availablePoints: "13500", payout: 3600 });
  expect(state.tx.walletTransaction.createMany).not.toHaveBeenCalled();
});
it.each([["rps","rock"],["dice","1"],["penalty","left"],["reaction","tap"],["trivia","1"],["teenpatti","deal"]])("%s uses only the free-point ledger", async (engine, choice) => {
  state.tx.gameDefinition.findUnique = async () => ({ id: "test-game", revision: 1, settings: { id: "test-game", name: "Test Game", engine, status: "active", minBet: 10, maxBet: 1000 } });
  state.tx.gamePlayChallenge={findUnique:async()=>({userId:"u",payload:{gameId:"test-game",revision:1,roomId:"ROOM-1",bet:100,readyAt:Date.now()-100,expiresAt:Date.now()+15000,question:0}})};
  const round = await placeRound(identity, { ...request, gameId: "test-game", choice });
  expect(round.currency).toBe("PLAY_POINTS");
  expect(state.tx.walletTransaction.createMany).not.toHaveBeenCalled();
  expect(state.tx.activityLevelAward.create).not.toHaveBeenCalled();
});
it("persists non-repeat history and hides answers when starting trivia",async()=>{
 state.tx.gameDefinition.findUnique=async()=>({id:"trivia",revision:1,settings:{name:"Trivia",engine:"trivia",status:"active",minBet:10,maxBet:10000}});
 let seen={};const challenges=new Map();
 state.tx.gameTriviaHistory={findUnique:async()=>({seen}),upsert:async({update})=>{seen=update.seen;}};
 state.tx.gamePlayChallenge={deleteMany:async()=>{},create:async({data})=>challenges.set(data.id,data),findUnique:async({where})=>challenges.get(where.id)};
 const first=await startChallenge(identity,{gameId:"trivia",bet:1000});
 const second=await startChallenge(identity,{gameId:"trivia",bet:1000});
 expect(first.questions).toHaveLength(3);expect(first.questions.every(q=>q.answer===undefined)).toBe(true);
 expect(second.questions.some(q=>first.questions.some(p=>p.id===q.id))).toBe(false);
 await expect(placeRound(identity,{...request,id:first.id,gameId:"trivia",bet:500,choice:["0","0","0"]})).rejects.toThrow("Invalid challenge");
 const saved=challenges.get(first.id).payload;
 const req={...request,id:first.id,gameId:"trivia",bet:1000,choice:saved.questions.map(q=>q.answer)};
 const round=await placeRound(identity,req);
 expect(round.outcome).toBe("win");expect(await placeRound(identity,req)).toEqual(round);
 expect(state.tx.gamePlayAccount.update).toHaveBeenCalledTimes(1);
});
