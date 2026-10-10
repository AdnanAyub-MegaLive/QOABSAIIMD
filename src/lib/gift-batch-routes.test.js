import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: {}, emit: vi.fn(), rows: [], ledger: [] }));
vi.mock("@/lib/currency-policy",async()=>({...await import("./currency-policy.js"),currencyPolicy:async()=>({version:1,rules:{giftBasis:"GROSS",giftDiamondsNumerator:"1",giftCoinsDenominator:"1"}})}));
vi.mock("@/lib/live-commerce", () => ({ getLiveCommerceRule: async () => ({ hostShareBps: 4000, agencyShareBps: 2000, companyShareBps: 4000, version: 1 }), applyLiveGiftReward: async () => {} }));
vi.mock("@/lib/gift-operation", () => ({ giftOperation: () => ({}), priorGiftOperation: async () => null, runGiftOperation: async (_id,_operation,work) => work(mocks.db), flushRealtimeOutbox: async () => {} }));
vi.mock("@/lib/progression", () => ({ awardGiftProgress: async () => null, publicProgression: async () => new Map(), appendOutbox: async (_tx,_channel,event,data) => mocks.emit(_channel,event,{success:true,data}) }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/mobile-api", () => ({
  requireMobileUser: async () => ({ id: "sender", publicId: "USR-S", name: "Sender" }),
  mobileOptions: () => new Response(null, { status: 204 }),
  mobileJson: (body, status = 200) => Response.json(body, { status }),
  mobileApiError: e => Response.json({ success: false, error: { code: e.code } }, { status: 422 }),
}));
vi.mock("@/lib/profit-rules", () => ({ coinsForShare: (n, b) => n * BigInt(b) / 10000n, getProfitSplitRule: async () => ({ normalUserReusableShareBps: 1000, version: 1 }) }));
vi.mock("@/lib/realtime", () => ({ audioRoomParticipantIds: async () => new Set(["USR-S", "USR-A", "USR-B"]), emitToAudioRoom: mocks.emit, emitToUser: mocks.emit, emitToVideoLive: mocks.emit }));
vi.mock("@/lib/upload-assets", () => ({ createPublicDisplayAssetUrl: () => "https://portal.test/gift" }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test" }));
vi.mock("@/lib/gift-sender", () => ({ resolveGiftSender: async u => ({ id: u.publicId }) }));
vi.mock("@/lib/wallet", () => ({ ledgerData: d => d }));
vi.mock("@/lib/gift-leaderboard", () => ({ getRoomGiftLeaderboard: async () => ({ topGifters: [], topReceivers: [] }) }));
vi.mock("@/lib/daily-tasks", () => ({ addDailyTaskProgress: async () => {} }));
vi.mock("@/lib/gift-batch", async () => import("./gift-batch"));
vi.mock("@/lib/mobile-v1", () => ({ v1Options: () => new Response(null), withV1Request: (_r, _o, next) => next() }));
vi.mock("@/app/api/gifts/send/route", async () => import("../app/api/gifts/send/route"));

import { POST as standard } from "../app/api/gifts/send/route";
import { POST as backpack } from "../app/api/v1/gifts/backpack/send/route";
import { POST as lucky } from "../app/api/v1/gifts/lucky/send/route";

beforeEach(() => {
  mocks.emit.mockClear(); mocks.rows.length = 0; mocks.ledger.length = 0;
  Object.assign(mocks.db, {
    uploadAsset: { findFirst: async () => ({ id: "gift", publicId: "AST-1", name: "Rose", giftTier: "LUCKY", giftRewardMinBps: 0, giftRewardMaxBps: 0, coinPrice: 100n }) },
    user: { findFirst: async ({ where }) => ({ id: where.publicId, publicId: where.publicId, appRoles: [] }), updateMany: vi.fn(async () => ({ count: 1 })), update: async () => ({}), findUniqueOrThrow: async () => ({ coinBalance: 1000n }) },
    talent: { findUnique: async () => null },
    audioRoom: { findFirst: async () => ({ id: "room", roomId: "ROOM-1" }) },
    audioRoomPkSession: { findFirst: async () => null },
    giftTransaction: { create: async ({ data }) => { const row = { ...data, id: `tx-${mocks.rows.length}`, createdAt: new Date() }; mocks.rows.push(row); return row; } },
    giftSettlement: { create: async ({ data }) => data },
    walletTransaction: { create: async ({ data }) => { mocks.ledger.push(data); return data; } },
    auditLog: { create: async () => ({}) },
    userGiftInventory: { updateMany: vi.fn(async () => ({ count: 1 })) },
    $transaction: async fn => fn(mocks.db),
  });
});

const request = body => new Request("https://portal.test/api/gifts/send", { method: "POST", body: JSON.stringify({ giftId: "AST-1", roomId: "ROOM-1", recipientId: "USR-A", ...body }) });
describe.each([["standard", standard], ["backpack", backpack], ["lucky", lucky]])("%s gift batching", (_name, send) => {
  it("persists and echoes the same batch without merging recipient transactions", async () => {
    for (const recipientId of ["USR-A", "USR-B"]) {
      const response = await send(request({ recipientId, giftBatchId: "batch-1" }));
      expect(response.status).toBe(201);
      expect((await response.json()).data.giftBatchId).toBe("batch-1");
    }
    expect(mocks.rows).toHaveLength(2);
    expect(mocks.rows.map(r => r.giftBatchId)).toEqual(["batch-1", "batch-1"]);
    expect(new Set(mocks.rows.map(r => r.id)).size).toBe(2);
    expect(new Set(mocks.ledger.map(r => r.referenceId)).size).toBe(2);
    const events = mocks.emit.mock.calls.filter(c => c[1] === "gift:received");
    expect(events).toHaveLength(2);
    expect(events.map(c => c[2].data.giftBatchId)).toEqual(["batch-1", "batch-1"]);
  });
  it("echoes null for legacy clients", async () => {
    const response = await send(request({}));
    expect(response.status).toBe(201);
    expect((await response.json()).data.giftBatchId).toBeNull();
  });
  it("rejects invalid correlation before settlement", async () => {
    const response = await send(request({ giftBatchId: "x".repeat(65) }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.rows).toHaveLength(0);
    expect(mocks.ledger).toHaveLength(0);
    expect(mocks.emit).not.toHaveBeenCalled();
  });
});
