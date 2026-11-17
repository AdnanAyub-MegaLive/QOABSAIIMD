import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletTransactionType } from "@prisma/client";

const mocks = vi.hoisted(() => ({ db: {}, emit: vi.fn(), rows: [], ledger: [], participants: new Set(), grace: false }));
vi.mock("@/lib/currency-policy",async()=>({...await import("./currency-policy.js"),currencyPolicy:async()=>({version:1,rules:{giftBasis:"GROSS",giftDiamondsNumerator:"1",giftCoinsDenominator:"1"}})}));
vi.mock("@/lib/live-commerce", () => ({ getLiveCommerceRule: async () => ({ hostShareBps: 4000, agencyShareBps: 2000, companyShareBps: 4000, version: 1 }), applyLiveGiftReward: async () => {} }));
vi.mock("@/lib/gift-operation", () => ({ giftContentionKeys: recipients => recipients.map(r => r.id), giftOperation: () => ({}), priorGiftOperation: async () => null, runGiftOperation: async (_id,_operation,work) => work(mocks.db), flushRealtimeOutbox: async () => {} }));
vi.mock("@/lib/progression", () => ({ awardGiftProgress: async () => null, publicProgression: async () => new Map(), appendOutbox: async (_tx,_channel,event,data) => mocks.emit(_channel,event,{success:true,data}) }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/mobile-api", () => ({
  requireMobileUser: async () => ({ id: "sender", publicId: "USR-S", name: "Sender" }),
  mobileOptions: () => new Response(null, { status: 204 }),
  mobileJson: (body, status = 200) => Response.json(body, { status }),
  giftJson: (body, status = 200) => Response.json(body, { status }),
  mobileApiError: e => Response.json({ success: false, error: { code: e.code } }, { status: 422 }),
}));
vi.mock("@/lib/profit-rules", () => ({ coinsForShare: (n, b) => n * BigInt(b) / 10000n, getProfitSplitRule: async () => ({ hostShareBps:4000, agencyShareBps:2000, normalUserReusableShareBps: 1000, version: 1 }) }));
vi.mock("@/lib/realtime", () => ({ audioRoomParticipantIds: async () => new Set(mocks.participants), emitToAudioRoom: mocks.emit, emitToUser: mocks.emit, emitToVideoLive: mocks.emit }));
vi.mock("@/lib/upload-assets", () => ({ createPublicDisplayAssetUrl: () => "https://portal.test/gift" }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test" }));
vi.mock("@/lib/gift-sender", () => ({ resolveGiftSender: async u => ({ id: u.publicId }), settledGiftSender: s => s }));
vi.mock("@/lib/wallet", () => ({ ledgerData: d => d }));
vi.mock("@/lib/gift-leaderboard", () => ({ getRoomGiftLeaderboard: async () => ({ topGifters: [], topReceivers: [] }) }));
vi.mock("@/lib/daily-tasks", () => ({ addDailyTaskProgress: async () => {} }));
vi.mock("@/lib/gift-batch", async () => import("./gift-batch"));
vi.mock("@/lib/mobile-v1", () => ({ v1Options: () => new Response(null), withV1Request: (_r, _o, next) => next() }));
vi.mock("@/app/api/gifts/send/route", async () => import("../app/api/gifts/send/route"));

import { POST as standard } from "../app/api/gifts/send/route";
import { POST as multi } from "../app/api/v1/gifts/send-multi/route";
import { prepareMultiGift } from './multi-gift-settlement';
import { recordAudioRoomJoin, recordAudioRoomLeave, resetGiftLeaveGrace } from './gift-leave-grace';

beforeEach(() => {
  mocks.emit.mockClear(); mocks.rows.length = 0; mocks.ledger.length = 0;
  Object.assign(mocks.db, {
    uploadAsset: { findFirst: async () => ({ id: "gift", publicId: "AST-1", name: "Rose", giftTier: "LUCKY", giftRewardMinBps: 0, giftRewardMaxBps: 0, coinPrice: 100n }) },
    user: { findFirst: async ({ where }) => ({ id: where.publicId, publicId: where.publicId, appRoles: [] }), updateMany: vi.fn(async () => ({ count: 1 })), updateManyAndReturn: vi.fn(async () => [{coinBalance:1000n}]), update: vi.fn(async () => ({})), findUniqueOrThrow: async () => ({ coinBalance: 1000n }) },
    talent: { findUnique: async () => null },
    audioRoom: { findFirst: async () => ({ id: "room", roomId: "ROOM-1" }) },
    audioRoomPkSession: { findFirst: async () => null },
    giftTransaction: { create: async ({ data }) => { const row = { ...data, id: `tx-${mocks.rows.length}`, createdAt: new Date() }; mocks.rows.push(row); return row; } },
    giftSettlement: { create: async ({ data }) => data },
    walletTransaction: { createMany: vi.fn(async ({data}) => { mocks.ledger.push(...data); return {count:data.length}; }), create: async ({ data }) => { mocks.ledger.push(data); return data; } },
    auditLog: { create: async () => ({}) },
    userGiftInventory: { updateMany: vi.fn(async () => ({ count: 1 })) },
    luckyGiftPolicy: { findUnique: async () => ({ id: "GLOBAL", poolContributionBps: 6000, bigWinMinCoins: 10000n, multipliers: [{ multiplierBps: 0, weight: 1 }], version: 1 }) },
    luckyGiftPool: { upsert: async () => ({}), findUniqueOrThrow: async () => ({ id: "GLOBAL", balance: 0n }), update: async () => ({}) },
    $queryRaw: vi.fn(async () => [await mocks.db.luckyGiftPool.findUniqueOrThrow()]),
    $transaction: async fn => fn(mocks.db),
    giftLeaveGraceSettings: { findUnique: vi.fn(async () => ({ enabled: mocks.grace })) },
  });
  resetGiftLeaveGrace(); mocks.grace = false; mocks.participants = new Set(["USR-S", "USR-A", "USR-B"]);
  mocks.db.user.findMany = async () => ["USR-A", "USR-B"].map(publicId => ({ id: publicId, publicId, appRoles: [] }));
});

const request = body => new Request("https://portal.test/api/gifts/send", { method: "POST", body: JSON.stringify({ giftId: "AST-1", roomId: "ROOM-1", recipientId: "USR-A", ...body }) });
const now = Date.now();
const iso = ms => new Date(ms).toISOString();
function senderLeft({ joinedAgo = 60_000, leftAgo = 10_000 } = {}) {
  recordAudioRoomJoin("USR-S", "audio-room:ROOM-1", now - joinedAgo);
  recordAudioRoomLeave("USR-S", "audio-room:ROOM-1", now - leftAgo);
  mocks.participants = new Set(["USR-A", "USR-B"]);
}
const roomEffects = () => mocks.emit.mock.calls.filter(call => call[0] === "audio-room:ROOM-1" && call[1] === "gift:received");

describe("single gift leave grace", () => {
  it("keeps today's rejection when the switch is off even with tappedAt", async () => {
    senderLeft();
    const response = await standard(request({ tappedAt: iso(now - 20_000) }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("ROOM_PARTICIPANT_REQUIRED");
    expect(mocks.rows).toHaveLength(0);
  });
  it("does not read the switch when the sender is present and returns no late flag", async () => {
    const response = await standard(request({ tappedAt: iso(now) }));
    expect(response.status).toBe(201);
    expect((await response.json()).data.late).toBeUndefined();
    expect(mocks.db.giftLeaveGraceSettings.findUnique).not.toHaveBeenCalled();
    expect(roomEffects()).toHaveLength(1);
  });
  it("settles a late gift quietly inside the window", async () => {
    mocks.grace = true; senderLeft();
    const response = await standard(request({ tappedAt: iso(now - 20_000) }));
    expect(response.status).toBe(201);
    expect((await response.json()).data.late).toBe(true);
    expect(mocks.rows).toHaveLength(1);
    expect(mocks.ledger.map(row => row.type)).toEqual(expect.arrayContaining(["GIFT_SENT", "GIFT_RECEIVED"]));
    expect(roomEffects()).toHaveLength(0);
    expect(mocks.emit.mock.calls.some(call => call[1] === "audio-room:gift-leaderboard")).toBe(true);
  });
  it.each([
    ["no tappedAt", () => ({}), {}],
    ["tap before join", () => ({ tappedAt: iso(now - 120_000) }), {}],
    ["future tap", () => ({ tappedAt: iso(now + 60_000) }), {}],
    ["left too long ago", () => ({ tappedAt: iso(now - 130_000) }), { joinedAgo: 200_000, leftAgo: 125_000 }],
    ["invalid tappedAt", () => ({ tappedAt: "yesterday" }), {}],
  ])("rejects %s", async (_label, extra, presence) => {
    mocks.grace = true; senderLeft(presence);
    const response = await standard(request(extra()));
    expect(response.status).toBe(403);
    expect(mocks.rows).toHaveLength(0);
  });
  it("rejects a tappedAt from a user who never joined the room", async () => {
    mocks.grace = true; mocks.participants = new Set(["USR-A"]);
    const response = await standard(request({ tappedAt: iso(now - 5_000) }));
    expect(response.status).toBe(403);
  });
  it("still rejects when the recipient left", async () => {
    mocks.grace = true; senderLeft(); mocks.participants = new Set(["USR-B"]);
    const response = await standard(request({ tappedAt: iso(now - 20_000) }));
    expect(response.status).toBe(403);
    expect(mocks.rows).toHaveLength(0);
  });
});

describe("multi and combo leave grace", () => {
  const body = { roomId: "ROOM-1", giftId: "AST-1", recipientIds: ["USR-A", "USR-B"], comboId: "combo" };
  it("rejects when the switch is off", async () => {
    senderLeft();
    await expect(prepareMultiGift({ id: "sender", publicId: "USR-S" }, { ...body, tappedAt: iso(now - 20_000) }, request(body), { batch: true })).rejects.toMatchObject({ code: "ROOM_PARTICIPANT_REQUIRED" });
  });
  it("settles combo taps quietly with lucky rewards inside the window", async () => {
    mocks.grace = true; senderLeft();
    mocks.db.luckyGiftPolicy.findUnique = async () => ({ id: "GLOBAL", poolContributionBps: 6000, bigWinMinCoins: 1n, multipliers: [{ multiplierBps: 10000, weight: 1 }], version: 1 });
    mocks.db.luckyGiftPool.findUniqueOrThrow = async () => ({ id: "GLOBAL", balance: 10000n });
    const prepared = await prepareMultiGift({ id: "sender", publicId: "USR-S" }, { ...body, tappedAt: iso(now - 20_000) }, request(body), { batch: true });
    const first = await prepared.settle(mocks.db, { key: "tap-0001" });
    expect(first.late).toBe(true);
    expect(first.luckyRewardCoins).toBe("200");
    expect(mocks.ledger.filter(row => row.type === "LUCKY_GIFT_REWARD")).toHaveLength(2);
    expect(roomEffects()).toHaveLength(0);
  });
  it("rejects when a recipient left", async () => {
    mocks.grace = true; senderLeft(); mocks.participants = new Set(["USR-A"]);
    await expect(prepareMultiGift({ id: "sender", publicId: "USR-S" }, { ...body, tappedAt: iso(now - 20_000) }, request(body), { batch: true })).rejects.toMatchObject({ code: "ROOM_PARTICIPANT_REQUIRED" });
  });
  it("multi-send without tappedAt keeps today's behaviour", async () => {
    mocks.grace = true; senderLeft();
    const response = await multi(request({ requestId: "multi-late-test", recipientIds: ["USR-A", "USR-B"] }));
    expect(response.status).not.toBe(201);
    expect(mocks.rows).toHaveLength(0);
  });
});
