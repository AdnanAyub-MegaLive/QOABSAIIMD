import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: {}, sender: {}, currentSender: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: state.db }));
vi.mock("@/lib/wallet", async () => import("./wallet.js"));
vi.mock("@/lib/mobile-api", () => ({
  requireMobileUser: async () => state.sender,
  mobileOptions: () => new Response(null, { status: 204 }),
  mobileJson: (body, status = 200) => Response.json(body, { status }),
  mobileApiError: (error) => Response.json({ error: error.message }, { status: 403 }),
}));
import { POST } from "../app/api/wallet/transfers/route.js";

beforeEach(() => {
  vi.stubEnv("WALLET_TRANSFER_MAX_COINS", "");
  state.sender = { id: "sender", publicId: "USR-S", name: "Reseller", appRoles: ["RESELLER"], status: "ACTIVE", deletedAt: null };
  state.currentSender = { appRoles: ["RESELLER"], status: "ACTIVE", deletedAt: null };
  Object.assign(state.db, {
    user: {
      findUniqueOrThrow: vi.fn(async ({ select }) => select.appRoles ? state.currentSender : { coinBalance: 5000n, resellerCoinBalance:800n }),
      findFirst: vi.fn(async () => ({ id: "recipient", publicId: "USR-R", name: "Recipient", status: "ACTIVE" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    walletTransaction: { create: vi.fn(async ({ data }) => ({ ...data, publicId: "TX-1" })) },
    resellerRechargeRequest: {findUnique:vi.fn(async()=>null),create:vi.fn(async()=>({}))},
    notification: { upsert: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (callback) => callback(state.db)),
  });
});
afterEach(() => vi.unstubAllEnvs());

const send = (body = {}) => POST(new Request("http://localhost/api/wallet/transfers", {
  method: "POST", body: JSON.stringify({ recipientPublicId: "USR-R", coins: "200", requestId:"request-123", ...body }),
}));

describe("Reseller coin transfers", () => {
  it("accepts 500 million Coins and records matching ledger amounts", async () => {
    expect((await send({ coins: "500000000" })).status).toBe(201);
    expect(state.db.user.updateMany.mock.calls[0][0].data.resellerCoinBalance).toEqual({ decrement: 500000000n });
    expect(state.db.walletTransaction.create.mock.calls.map(([arg]) => arg.data.coins)).toEqual([500000000n, 500000000n]);
  });
  it("rejects amounts above 500 million before starting a transaction", async () => {
    expect((await (await send({ coins: "500000001" })).json()).error).toBe("TRANSFER_LIMIT");
    expect(state.db.user.updateMany).not.toHaveBeenCalled();
  });
  it("continues to honor an explicitly configured maximum", async () => {
    vi.stubEnv("WALLET_TRANSFER_MAX_COINS", "1000");
    expect((await (await send({ coins: "1001" })).json()).error).toBe("TRANSFER_LIMIT");
    expect(state.db.$transaction).not.toHaveBeenCalled();
  });
  it("blocks a non-reseller before any balance mutation", async () => {
    state.sender.appRoles = ["LISTENER"];
    expect((await (await send()).json()).error).toBe("RESELLER_REQUIRED");
    expect(state.db.$transaction).not.toHaveBeenCalled();
  });
  it("rechecks a revoked role inside the transaction", async () => {
    state.currentSender.appRoles = ["LISTENER"];
    expect((await (await send()).json()).error).toBe("RESELLER_REQUIRED");
    expect(state.db.user.updateMany).not.toHaveBeenCalled();
  });
  it("debits and credits equal amounts with linked ledger entries", async () => {
    const response = await send();
    expect(response.status).toBe(201);
    expect(state.db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
    expect(state.db.user.updateMany.mock.calls[0][0].data).toEqual({ resellerCoinBalance: { decrement: 200n } });
    expect(state.db.user.updateMany.mock.calls[1][0].data.coinBalance).toEqual({ increment: 200n });
    const rows = state.db.walletTransaction.create.mock.calls.map(([arg]) => arg.data);
    expect(rows.map((row) => row.coins)).toEqual([200n, 200n]);
    expect(rows.map((row) => row.direction)).toEqual(["DEBIT", "CREDIT"]);
    expect(rows[0].referenceId).toBe(rows[1].referenceId);
  });
  it("never credits the recipient when funds are insufficient", async () => {
    state.db.user.updateMany.mockResolvedValue({ count: 0 });
    expect((await (await send()).json()).error).toBe("INSUFFICIENT_COINS");
    expect(state.db.user.update).not.toHaveBeenCalled();
    expect(state.db.walletTransaction.create).not.toHaveBeenCalled();
  });
  it("allows business-to-personal self recharge with separate ledger labels",async()=>{
    state.db.user.findFirst.mockResolvedValue({...state.sender});
    const response=await send({recipientPublicId:"USR-S"});
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({businessCoins:"800",personalCoins:"5000",remainingCoins:"800"});
    const rows=state.db.walletTransaction.create.mock.calls.map(([a])=>a.data);
    expect(rows.map(r=>r.metadata.wallet)).toEqual(["BUSINESS","PERSONAL"]);
    expect(rows[0].userId).toBe(rows[1].userId);
  });
  it("returns the saved outcome on retry without another mutation",async()=>{
    await send();
    const saved=state.db.resellerRechargeRequest.create.mock.calls[0][0].data;
    state.db.resellerRechargeRequest.findUnique.mockResolvedValue(saved);
    state.db.user.updateMany.mockClear();
    expect((await (await send()).json()).data).toEqual(saved.result);
    expect(state.db.user.updateMany).not.toHaveBeenCalled();
    expect((await (await send({coins:"201"})).json()).error).toContain("different content");
  });
  it("requires a retry key and preserves CS mixed-role restrictions",async()=>{
    expect((await send({requestId:null})).status).toBe(403);
    state.currentSender.appRoles=["RESELLER","CS"];
    expect((await (await send()).json()).error).toBe("RESELLER_REQUIRED");
    expect(state.db.user.updateMany).not.toHaveBeenCalled();
  });
});
