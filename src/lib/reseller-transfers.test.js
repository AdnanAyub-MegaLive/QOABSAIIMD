import { beforeEach, describe, expect, it, vi } from "vitest";

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
  state.sender = { id: "sender", publicId: "USR-S", name: "Reseller", appRoles: ["RESELLER"] };
  state.currentSender = { appRoles: ["RESELLER"], status: "ACTIVE", deletedAt: null };
  Object.assign(state.db, {
    user: {
      findUniqueOrThrow: vi.fn(async ({ select }) => select.appRoles ? state.currentSender : { coinBalance: 800n }),
      findFirst: vi.fn(async () => ({ id: "recipient", publicId: "USR-R", name: "Recipient", status: "ACTIVE" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    walletTransaction: { create: vi.fn(async ({ data }) => ({ ...data, publicId: "TX-1" })) },
    $transaction: vi.fn(async (callback) => callback(state.db)),
  });
});

const send = (body = {}) => POST(new Request("http://localhost/api/wallet/transfers", {
  method: "POST", body: JSON.stringify({ recipientPublicId: "USR-R", coins: "200", ...body }),
}));

describe("Reseller coin transfers", () => {
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
    expect(state.db.user.updateMany.mock.calls[0][0].data.coinBalance).toEqual({ decrement: 200n });
    expect(state.db.user.update.mock.calls[0][0].data.coinBalance).toEqual({ increment: 200n });
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
});
