import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), admin: vi.fn(), portalPermission: vi.fn(), legacy: vi.fn(), gallery: vi.fn(), backgrounds: vi.fn(), config: vi.fn(), withdrawal: vi.fn() }));
vi.mock("@/lib/portal-admin", () => ({ requirePermission: m.permission, requirePortalAdmin: m.admin, portalPermissionError: m.portalPermission }));
vi.mock("@/lib/prisma", () => ({ prisma: { profileCover: { findMany: m.legacy }, profileCoverItem: { findMany: m.gallery }, customRoomBackgroundRequest: { findMany: m.backgrounds }, walletWithdrawal: { findMany: m.withdrawal } } }));
vi.mock("@/lib/custom-room-backgrounds", () => ({ getCustomBackgroundConfiguration: m.config }));
import { GET as covers } from "../app/api/admin/profile-covers/route.js";
import { GET as backgrounds } from "../app/api/admin/custom-backgrounds/route.js";
import { GET as finance } from "../app/api/admin/wallet/records/route.js";
const req = q => new Request(`https://portal.test/api?${q ?? ""}`);
beforeEach(() => { vi.clearAllMocks(); m.permission.mockResolvedValue({ id: "admin" }); m.admin.mockResolvedValue({ id: "admin" }); m.portalPermission.mockResolvedValue(null); for (const f of [m.legacy, m.gallery, m.backgrounds, m.withdrawal]) f.mockResolvedValue([]); m.config.mockResolvedValue({ settings: {}, prices: [] }); });
it("protects all three listing endpoints before reading records", async () => {
  m.permission.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 })); m.portalPermission.mockResolvedValue(new Response(null, { status: 403 }));
  for (const handler of [covers, backgrounds, finance]) expect((await handler(req())).status).toBe(403);
  for (const f of [m.legacy, m.gallery, m.backgrounds, m.withdrawal]) expect(f).not.toHaveBeenCalled();
});
it("pages legacy covers by userId without requiring an id column", async () => {
  m.legacy.mockResolvedValue([{ userId: "a", updatedAt: new Date(0) }, { userId: "b", updatedAt: new Date(0) }]);
  const response = await covers(req("source=LEGACY&limit=1")); const data = (await response.json()).data;
  expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(data.items).toHaveLength(1);
  await covers(req(`source=LEGACY&cursor=${data.nextCursor}`));
  expect(m.legacy.mock.lastCall[0]).toMatchObject({ orderBy: [{ updatedAt: "asc" }, { userId: "asc" }], where: { AND: [{ status: "PENDING" }, { OR: [{ updatedAt: { gt: new Date(0) } }, { updatedAt: new Date(0), userId: { gt: "a" } }] }] } });
  expect(m.gallery).not.toHaveBeenCalled();
});
it("keeps gallery separate and validates source/status", async () => {
  expect((await covers(req("source=GALLERY&status=REJECTED"))).status).toBe(200);
  expect(m.gallery.mock.lastCall[0]).toMatchObject({ take: 51, where: { AND: [{ status: "REJECTED" }, {}] } });
  expect((await covers(req("source=UNKNOWN"))).status).toBe(422);
});
it("pages backgrounds oldest first and preserves response aliases", async () => {
  m.backgrounds.mockResolvedValue([{ id: "internal-a", publicId: "BG-a", coins: 500n, submittedAt: new Date(0) }, { id: "internal-b", publicId: "BG-b", coins: 500n, submittedAt: new Date(0) }]);
  const response = await backgrounds(req("limit=1")), data = (await response.json()).data;
  expect(data.items).toEqual(data.requests); expect(data.items[0].coins).toBe("500"); expect(data.nextCursor).toBeTruthy();
  expect(m.backgrounds.mock.lastCall[0]).toMatchObject({ take: 2, orderBy: [{ submittedAt: "asc" }, { id: "asc" }], where: { AND: [{ status: "PENDING" }, {}] } });
});
