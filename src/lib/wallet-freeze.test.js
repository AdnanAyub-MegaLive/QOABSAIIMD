import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
const { isWalletFrozenError, setWalletFreeze, walletFrozenResponse } = await import("./wallet-freeze.js");

function fakeDb(frozen = false) {
  const state = { user: { id: "u1", publicId: "USR-1", walletFrozen: frozen }, events: [], audits: [] };
  const db = {
    state,
    user: { findUnique: async () => ({ ...state.user }), update: async ({ data }) => Object.assign(state.user, data) },
    walletFreezeEvent: { create: async ({ data }) => state.events.push(data) },
    auditLog: { create: async ({ data }) => state.audits.push(data) },
  };
  db.$transaction = fn => fn(db);
  return db;
}
const admin = { id: "a1", name: "RM" };

describe("wallet freeze", () => {
  it("requires a proper explanation", async () => {
    await expect(setWalletFreeze(fakeDb(), { admin, userId: "u1", frozen: true, reason: "spam" })).rejects.toThrow("10 to 500");
  });
  it("freezes, records history and audits", async () => {
    const db = fakeDb();
    await setWalletFreeze(db, { admin, userId: "u1", frozen: true, reason: "Suspected chargeback abuse" });
    expect(db.state.user).toMatchObject({ walletFrozen: true, walletFrozenReason: "Suspected chargeback abuse", walletFrozenByAdminId: "a1" });
    expect(db.state.events[0]).toMatchObject({ frozen: true, adminId: "a1" });
    expect(db.state.audits[0].action).toBe("WALLET_FREEZE");
    await expect(setWalletFreeze(db, { admin, userId: "u1", frozen: true, reason: "Suspected chargeback abuse" })).rejects.toMatchObject({ status: 409 });
  });
  it("gives a friendly 403 for frozen users only", async () => {
    expect(await walletFrozenResponse("u1", fakeDb(false))).toBeNull();
    const response = await walletFrozenResponse("u1", fakeDb(true));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("WALLET_FROZEN");
  });
  it("recognises the database guard error", () => {
    expect(isWalletFrozenError(new Error("Raw query failed. Code: `P0001`. Message: `WALLET_FROZEN`"))).toBe(true);
    expect(isWalletFrozenError(new Error("INSUFFICIENT_COINS"))).toBe(false);
  });
});
