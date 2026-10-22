import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), requirePermission: vi.fn(), banners: vi.fn(), currency: vi.fn(), settings: vi.fn() }));
vi.mock("@/lib/portal-admin", () => ({ portalPermissionError: mocks.permission, requirePermission: mocks.requirePermission, requirePortalAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { roomBanner: { findMany: mocks.banners }, currencyRequest: { findMany: mocks.currency } } }));
vi.mock("@/lib/room-banners", () => ({ bannerSettings: mocks.settings, ownerBanner: row => ({ id: row.id }), validateBannerSettings: vi.fn(), changeBanner: vi.fn(), editBannerText: vi.fn() }));
import { GET as banners } from "../app/api/admin/room-banners/route.js";
import { GET as currency } from "../app/api/admin/wallet/currency-requests/route.js";
const request = (query = "") => new Request(`https://portal.test/queue?${query}`);
beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue(null); mocks.requirePermission.mockResolvedValue({ id: "admin" }); mocks.settings.mockResolvedValue({ enabled: true }); mocks.banners.mockResolvedValue([]); mocks.currency.mockResolvedValue([]); });
it("protects both queues before querying", async () => {
  mocks.permission.mockResolvedValue(new Response(null, { status: 403 }));
  mocks.requirePermission.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403, code: "FORBIDDEN" }));
  expect((await banners(request())).status).toBe(403); expect(mocks.banners).not.toHaveBeenCalled();
  expect((await currency(request())).status).toBe(403); expect(mocks.currency).not.toHaveBeenCalled();
});
it("pages pending banners oldest first and preserves tie boundaries", async () => {
  mocks.banners.mockResolvedValue([{ id: "a", createdAt: new Date(0) }, { id: "b", createdAt: new Date(0) }]);
  const response = await banners(request("limit=1")); expect(response.headers.get("cache-control")).toBe("no-store");
  const data = (await response.json()).data; expect(data.items).toHaveLength(1); expect(data.nextCursor).toBeTruthy();
  await banners(request(`limit=1&cursor=${data.nextCursor}`));
  expect(mocks.banners.mock.lastCall[0]).toMatchObject({ take: 2, orderBy: [{ createdAt: "asc" }, { id: "asc" }], where: { AND: [{ status: "PENDING" }, { OR: [{ createdAt: { gt: new Date(0) } }, { createdAt: new Date(0), id: { gt: "a" } }] }] } });
});
it("returns decimal strings and filters currency requests without exposing request fingerprints", async () => {
  mocks.currency.mockResolvedValue([{ id: "c", createdAt: new Date(0), diamonds: 9000000000000000n, quotedCoins: 500n }]);
  const response = await currency(request("kind=REDEMPTION"));
  expect((await response.json()).data.items[0].diamonds).toBe("9000000000000000");
  expect(mocks.requirePermission).toHaveBeenCalledWith("finance.withdrawals");
  expect(mocks.currency.mock.lastCall[0]).toMatchObject({ where: { AND: [{ status: { in: ["PENDING", "APPROVED"] }, kind: "REDEMPTION" }, {}] }, take: 51 });
  expect(mocks.currency.mock.lastCall[0].select).not.toHaveProperty("fingerprint");
});
it("rejects invalid filters rather than querying all records", async () => {
  expect((await banners(request("status=INVALID"))).status).toBe(422);
  expect((await currency(request("kind=INVALID"))).status).toBe(422);
  expect(mocks.banners).not.toHaveBeenCalled(); expect(mocks.currency).not.toHaveBeenCalled();
});
