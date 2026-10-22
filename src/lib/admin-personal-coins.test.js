import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ db: {}, permission: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: m.db }));
vi.mock("@/lib/portal-admin", () => ({ requirePermission: m.permission }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./password", () => ({ generateTemporaryPassword: vi.fn(), hashPassword: vi.fn() }));
vi.mock("./props-store", () => ({ syncProgressionProps: vi.fn() }));
vi.mock("./special-id", () => ({ autoAssignEligibleSpecialId: vi.fn(async () => null) }));
import { adjustUserCoins } from "../app/database-actions.js";
import { syncProgressionProps } from "./props-store";

beforeEach(() => {
  vi.clearAllMocks(); m.permission.mockResolvedValue({ id: "admin", name: "Admin" });
  Object.assign(m.db, {
    user: { findUniqueOrThrow: vi.fn(async () => ({ id: "reseller", publicId: "USR-R", appRoles: ["RESELLER"], coinBalance: 100n, resellerCoinBalance: 5000n })), update: vi.fn() },
    coinAdjustment: { create: vi.fn() }, walletTransaction: { create: vi.fn() }, auditLog: { create: vi.fn() },
    adminCoinAdjustmentRequest: { findUnique: vi.fn(async () => null), create: vi.fn() },
    $transaction: vi.fn(fn => fn(m.db)),
  });
});
it("allows an authorised admin to add reseller personal Coins without touching business funds", async () => {
  expect(await adjustUserCoins("USR-R", "add", "250", "Personal reward", "request-123")).toBe("350");
  expect(m.permission).toHaveBeenCalledWith("finance.adjust");
  expect(m.db.user.update).toHaveBeenCalledWith({ where: { id: "reseller" }, data: { coinBalance: 350n, totalTopUp: { increment: 250n } } });
  expect(m.db.walletTransaction.create.mock.calls[0][0].data).toMatchObject({ coins: 250n, direction: "CREDIT", metadata: { wallet: "PERSONAL" } });
  expect(m.db.coinAdjustment.create.mock.calls[0][0].data).toMatchObject({ balanceBefore: 100n, balanceAfter: 350n });
  expect(m.db.auditLog.create).toHaveBeenCalledTimes(1);
});
it("preserves personal removal without altering the business wallet", async () => {
  expect(await adjustUserCoins("USR-R", "remove", "40", "Correction", "request-123")).toBe("60");
  expect(m.db.user.update.mock.calls[0][0].data).toEqual({ coinBalance: 60n });
});
it("returns committed success even if the derived props refresh fails", async () => {
  vi.mocked(syncProgressionProps).mockRejectedValueOnce(new Error("refresh unavailable"));
  expect(await adjustUserCoins("USR-R", "add", "250", "Reward", "request-123")).toBe("350");
  expect(m.db.adminCoinAdjustmentRequest.create).toHaveBeenCalledTimes(1);
});
it("does not bypass finance permissions", async () => {
  m.permission.mockRejectedValue(new Error("FORBIDDEN"));
  await expect(adjustUserCoins("USR-R", "add", "250", "Reward")).rejects.toThrow("FORBIDDEN");
  expect(m.db.$transaction).not.toHaveBeenCalled();
});
it.each(["0", "-1", "1.5", "invalid"])("rejects invalid amount %s", async amount => {
  await expect(adjustUserCoins("USR-R", "add", amount, "Reward")).rejects.toThrow("INVALID_COIN_ADJUSTMENT");
  expect(m.db.$transaction).not.toHaveBeenCalled();
});
