import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletTransactionType } from "@prisma/client";

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
  giftJson: (body, status = 200) => Response.json(body, { status }),
  mobileApiError: e => Response.json({ success: false, error: { code: e.code } }, { status: 422 }),
}));
vi.mock("@/lib/profit-rules", () => ({ coinsForShare: (n, b) => n * BigInt(b) / 10000n, getProfitSplitRule: async () => ({ normalUserReusableShareBps: 1000, version: 1 }) }));
vi.mock("@/lib/realtime", () => ({ audioRoomParticipantIds: async () => new Set(["USR-S", "USR-A", "USR-B", ...Array.from({length:26},(_,i)=>`USR-QA${i}`)]), emitToAudioRoom: mocks.emit, emitToUser: mocks.emit, emitToVideoLive: mocks.emit }));
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
import { POST as multi } from "../app/api/v1/gifts/send-multi/route";

beforeEach(() => {
  mocks.emit.mockClear(); mocks.rows.length = 0; mocks.ledger.length = 0;
  Object.assign(mocks.db, {
    uploadAsset: { findFirst: async () => ({ id: "gift", publicId: "AST-1", name: "Rose", giftTier: "LUCKY", giftRewardMinBps: 0, giftRewardMaxBps: 0, coinPrice: 100n }) },
    user: { findFirst: async ({ where }) => ({ id: where.publicId, publicId: where.publicId, appRoles: [] }), updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async () => ({})), findUniqueOrThrow: async () => ({ coinBalance: 1000n }) },
    talent: { findUnique: async () => null },
    audioRoom: { findFirst: async () => ({ id: "room", roomId: "ROOM-1" }) },
    audioRoomPkSession: { findFirst: async () => null },
    giftTransaction: { create: async ({ data }) => { const row = { ...data, id: `tx-${mocks.rows.length}`, createdAt: new Date() }; mocks.rows.push(row); return row; } },
    giftSettlement: { create: async ({ data }) => data },
    walletTransaction: { create: async ({ data }) => { mocks.ledger.push(data); return data; } },
    auditLog: { create: async () => ({}) },
    userGiftInventory: { updateMany: vi.fn(async () => ({ count: 1 })) },
    luckyGiftPolicy: { findUnique: async () => ({ id: "GLOBAL", poolContributionBps: 6000, bigWinMinCoins: 10000n, multipliers: [{ multiplierBps: 0, weight: 1 }], version: 1 }) },
    luckyGiftPool: { upsert: async () => ({}), findUniqueOrThrow: async () => ({ id: "GLOBAL", balance: 0n }), update: async () => ({}) },
    $queryRaw: vi.fn(async () => [await mocks.db.luckyGiftPool.findUniqueOrThrow()]),
    $transaction: async fn => fn(mocks.db),
  });
});

const request = body => new Request("https://portal.test/api/gifts/send", { method: "POST", body: JSON.stringify({ giftId: "AST-1", roomId: "ROOM-1", recipientId: "USR-A", ...body }) });
it('sends 26 Lucky gifts in input order, with one debit and one draw/event per recipient', async () => {
 const ids=Array.from({length:26},(_,i)=>`USR-QA${i}`);
 mocks.db.user.findMany=async()=>[...ids].reverse().map(publicId=>({id:publicId,publicId,appRoles:[]}));
 const response=await multi(request({requestId:'multi-26-test',recipientIds:ids}));
 expect(response.status).toBe(201);
 const data=(await response.json()).data;
 expect(data.recipients.map(r=>r.recipientId)).toEqual(ids);
 expect(data.totalCoins).toBe('2600');
 expect(mocks.db.user.updateMany).toHaveBeenCalledOnce();
 expect(mocks.db.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{coinBalance:{decrement:2600n},totalSpent:{increment:2600n}}}));
 expect(mocks.db.$queryRaw).toHaveBeenCalledTimes(1);
 expect(mocks.emit.mock.calls.filter(c=>c[1]==='gift:received')).toHaveLength(26);
 expect(mocks.emit.mock.calls.filter(c=>c[1]==='gift:received-multi')).toHaveLength(0);
 expect(data.recipients.every(r=>r.lucky?.rewardCoins==='0')).toBe(true);
});
it('reserves all backpack items once without a coin debit or Lucky payout', async () => {
 mocks.db.user.findMany=async()=>['USR-B','USR-A'].map(publicId=>({id:publicId,publicId,appRoles:[]}));
 const response=await multi(request({requestId:'bag-multi-test',bagItemId:'AST-1',recipientIds:['USR-A','USR-B'],quantity:3}));
 expect(response.status).toBe(201);
 expect(mocks.db.userGiftInventory.updateMany).toHaveBeenCalledWith({where:{userId:'sender',giftAssetId:'gift',quantity:{gte:6}},data:{quantity:{decrement:6}}});
 expect(mocks.db.user.updateMany).not.toHaveBeenCalled();
 expect(mocks.db.$queryRaw).not.toHaveBeenCalled();
 expect((await response.json()).data).toMatchObject({source:'BACKPACK',totalCoins:'0',consumedItems:6});
});
it('credits and returns each paid Lucky outcome with its own transaction reference',async()=>{
 mocks.db.user.findMany=async()=>['USR-A','USR-B'].map(publicId=>({id:publicId,publicId,appRoles:[]}));
 mocks.db.luckyGiftPolicy.findUnique=async()=>({id:'GLOBAL',poolContributionBps:6000,bigWinMinCoins:1n,multipliers:[{multiplierBps:10000,weight:1}],version:1});
 mocks.db.luckyGiftPool.findUniqueOrThrow=async()=>({id:'GLOBAL',balance:10000n});
 const response=await multi(request({requestId:'lucky-return-test',recipientIds:['USR-A','USR-B']}));
 expect(response.status).toBe(201);
 const data=(await response.json()).data;
 expect(data.luckyRewardCoins).toBe('200');
 const credits=mocks.db.user.update.mock.calls.map(([args])=>args).filter(args=>args.data.coinBalance);
 expect(credits).toEqual([{where:{id:'sender'},data:{coinBalance:{increment:200n}}}]);
 expect(data.recipients.map(r=>r.luckyRewardCoins)).toEqual(['100','100']);
 const rewards=mocks.ledger.filter(row=>row.type==='LUCKY_GIFT_REWARD');
 expect(rewards.map(row=>row.referenceId)).toEqual(data.transactionIds);
 expect(rewards.every(row=>row.coins===100n)).toBe(true);
});
it.each(['coins','backpack'])('rejects an insufficient %s balance before any recipient effects',async source=>{
 mocks.db.user.findMany=async()=>['USR-A','USR-B'].map(publicId=>({id:publicId,publicId,appRoles:[]}));
 if(source==='coins')mocks.db.user.updateMany.mockResolvedValue({count:0});
 else mocks.db.userGiftInventory.updateMany.mockResolvedValue({count:0});
 const response=await multi(request({requestId:'insufficient-test',recipientIds:['USR-A','USR-B'],...(source==='backpack'?{bagItemId:'AST-1'}:{})}));
 expect(response.status).not.toBe(201);expect(mocks.rows).toHaveLength(0);expect(mocks.ledger).toHaveLength(0);expect(mocks.emit).not.toHaveBeenCalled();
});
it('rejects 27 recipients and mismatched bag IDs without writes',async()=>{
 for(const body of [{recipientIds:Array.from({length:27},(_,i)=>`USR-QA${i}`)},{recipientIds:['USR-A'],bagItemId:'AST-other'}]){
 const response=await multi(request({requestId:'invalid-multi',...body}));expect(response.status).toBe(422);
 }expect(mocks.rows).toHaveLength(0);
});
it("multi-send credits ordinary recipients in Diamonds, never reusable Coins",async()=>{
 mocks.db.user.findMany=async()=>["USR-A","USR-B"].map(publicId=>({id:publicId,publicId,appRoles:[]}));
 const settlements=[];mocks.db.giftSettlement.create=async({data})=>{settlements.push(data);return data;};
 const updates=[];mocks.db.user.update=async args=>{updates.push(args);return {};};
 const response=await multi(request({requestId:"multi-unique",recipientIds:["USR-A","USR-B"]}));
 expect(response.status).toBe(201);
 expect(settlements).toHaveLength(2);
 expect(settlements.every(s=>s.recipientDiamonds===100n&&s.currencyPolicyVersion===1)).toBe(true);
 expect(updates.every(u=>u.data.hostSalaryCoinBalance.increment===100n&&!u.data.coinBalance)).toBe(true);
 expect(mocks.ledger.filter(r=>r.type==="GIFT_RECEIVED").every(r=>r.diamonds===100n&&!r.coins)).toBe(true);
 expect(mocks.ledger.find(r=>r.direction==="DEBIT")).toMatchObject({type:"GIFT_SENT",metadata:{source:"MULTI"}});
 expect(mocks.ledger.every(r=>Object.values(WalletTransactionType).includes(r.type))).toBe(true);
});
describe.each([["standard", standard], ["backpack", backpack], ["lucky", lucky]])("%s gift batching", (_name, send) => {
  it("allows room self-gifts while keeping the debit and recipient credit", async () => {
    mocks.db.user.findFirst = async () => ({id:"sender",publicId:"USR-S",appRoles:[]});
    const response = await send(request({recipientId:"USR-S"}));
    expect(response.status).toBe(201);
    expect(mocks.rows[0]).toMatchObject({senderId:"sender",recipientUserId:"sender",coinValue:100n});
    expect(mocks.ledger.some(row=>row.userId==="sender"&&row.type==="GIFT_RECEIVED"&&row.diamonds===100n)).toBe(true);
    if (_name === "backpack") expect(mocks.db.userGiftInventory.updateMany).toHaveBeenCalled();
    else expect(mocks.db.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:"sender",coinBalance:{gte:100n}}}));
  });
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

it("allows a self-gift outside a room",async()=>{
  mocks.db.user.findFirst=async()=>({id:"sender",publicId:"USR-S",appRoles:[]});
  const response=await standard(request({recipientId:"USR-S",roomId:null}));
  expect(response.status).toBe(201);
  expect(mocks.rows[0]).toMatchObject({senderId:"sender",recipientUserId:"sender"});
});

it("still rejects self-gifts with insufficient Coins",async()=>{
  mocks.db.user.findFirst=async()=>({id:"sender",publicId:"USR-S",appRoles:[]});
  mocks.db.user.updateMany.mockResolvedValue({count:0});
  const response=await standard(request({recipientId:"USR-S",roomId:null}));
  expect(response.status).not.toBe(201);
  expect(mocks.rows).toHaveLength(0);
  expect(mocks.ledger).toHaveLength(0);
});
