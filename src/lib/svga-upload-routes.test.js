import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), auth: vi.fn(), limited: vi.fn(), validate: vi.fn(), poster: vi.fn(), mirror: vi.fn(), notify: vi.fn(), create: vi.fn(), audit: vi.fn(), row: null, db: {} }));
vi.mock("../../auth", () => ({ auth: m.auth }));
vi.mock("@/lib/portal-admin", () => ({ portalPermissionError: m.permission, requirePermission: async () => ({ id: "admin" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: m.db }));
vi.mock("@/lib/svga-upload", () => ({ validateSvga: m.validate, decodeUploadPoster: m.poster }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: m.limited }));
vi.mock("@/lib/media-cdn", () => ({ mirrorAssetBestEffort: m.mirror }));
vi.mock("@/lib/gift-catalog-version", () => ({ notifyGiftCatalogUpdated: m.notify }));
vi.mock("@/lib/live-commerce", () => ({ getLiveCommerceRule: vi.fn() }));
import { POST } from "../app/api/uploads/route.js";
import { POST as live } from "../app/api/admin/live-commerce/route.js";
function request({ category = "GIFTS", mime = "application/octet-stream", bytes = "validated-by-mock", poster = false } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "SVGA test", category, distribution: "FREE", coinPrice: "100", giftTier: "CLASSIC", giftCategory: "NORMAL", senderXp: "1", receiverXp: "1" })) form.set(key, value);
  form.set("file", new File([bytes], "animation.svga", { type: mime }));
  if (poster) form.set("posterFile", new File(["image"], "poster.webp", { type: "image/webp" }));
  return new Request("https://portal.test/api/uploads", { method: "POST", body: form });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.permission.mockResolvedValue(null); m.auth.mockResolvedValue({ user: { id: "admin", name: "Admin" } }); m.limited.mockReturnValue(false);
  m.validate.mockResolvedValue({ version: "2.0", width: 100, height: 100 });
  m.poster.mockImplementation(async file => file?.size ? { posterFileData: Buffer.from("webp"), posterFileSize: 4, posterMimeType: "image/webp", posterFileName: "poster.webp" } : null);
  m.create.mockImplementation(async ({ data }) => m.row = { ...data, id: "internal", createdAt: new Date(), updatedAt: new Date(), assignments: [] });
  Object.assign(m.db, { $transaction: async work => work(m.db), uploadAsset: { create: m.create, findUniqueOrThrow: async () => m.row }, auditLog: { create: m.audit } });
  m.mirror.mockImplementation(async (_db, asset) => asset);
});
it("rejects unauthorized uploads before parsing or validation", async () => {
  m.permission.mockResolvedValue(Response.json({ success: false }, { status: 403 }));
  expect((await POST(request())).status).toBe(403); expect(m.validate).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
});
it("rate limits authenticated uploads before expensive validation", async () => {
  m.limited.mockReturnValue(true);
  expect((await POST(request())).status).toBe(429); expect(m.validate).not.toHaveBeenCalled();
});
it("normalizes SVGA MIME, preserves bytes and optional poster, then invokes CDN and catalogue invalidation", async () => {
  const response = await POST(request({ poster: true }));
  expect(response.status).toBe(201);
  expect(m.validate).toHaveBeenCalledWith(Buffer.from("validated-by-mock"));
  expect(m.create.mock.calls[0][0].data).toMatchObject({ mimeType: "application/svga", fileData: Buffer.from("validated-by-mock"), isGlobal: true, posterMimeType: "image/webp" });
  expect(m.mirror).toHaveBeenCalledOnce(); expect(m.notify).toHaveBeenCalledOnce();
  expect((await response.json()).data.asset.mimeType).toBe("application/svga");
});
it("supports the same validated SVGA and poster in the separate live catalogue", async () => {
  expect((await live(request({ poster: true }))).status).toBe(200);
  expect(m.validate).toHaveBeenCalledOnce();
  expect(m.create.mock.calls[0][0].data).toMatchObject({ category: "LIVE_GIFTS", mimeType: "application/svga", posterMimeType: "image/webp" });
  expect(m.mirror).toHaveBeenCalledOnce();
});
it("never saves or publishes malformed animations or posters", async () => {
  m.validate.mockRejectedValueOnce(Object.assign(new Error("Invalid SVGA"), { code: "VALIDATION_ERROR", status: 422 }));
  expect((await POST(request())).status).toBe(422);
  m.poster.mockRejectedValueOnce(Object.assign(new Error("Invalid poster"), { code: "VALIDATION_ERROR", status: 422 }));
  expect((await POST(request({ poster: true }))).status).toBe(422);
  expect(m.create).not.toHaveBeenCalled(); expect(m.mirror).not.toHaveBeenCalled();
});
it("rejects unsupported categories and files larger than 8 MiB", async () => {
  expect((await POST(request({ category: "ROOM_BACKGROUNDS" }))).status).toBe(422);
  expect((await POST(request({ bytes: Buffer.alloc(8 * 1024 * 1024 + 1) }))).status).toBe(413);
  expect(m.validate).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
});
