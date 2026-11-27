import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ convert: vi.fn(), permission: vi.fn(), auth: vi.fn(), limited: vi.fn(), validate: vi.fn(), poster: vi.fn(), mirror: vi.fn(), notify: vi.fn(), create: vi.fn(), audit: vi.fn(), duplicate: vi.fn(), lock: vi.fn(), row: null, db: {} }));
vi.mock("../../auth", () => ({ auth: m.auth }));
vi.mock("@/lib/portal-admin", () => ({ portalPermissionError: m.permission, requirePermission: async () => ({ id: "admin" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: m.db }));
vi.mock("@/lib/svga-upload", () => ({ validateSvga: m.validate, decodeUploadPoster: m.poster }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: m.limited }));
vi.mock("@/lib/media-cdn", () => ({ mirrorAssetBestEffort: m.mirror }));
vi.mock("@/lib/gift-catalog-version", () => ({ notifyGiftCatalogUpdated: m.notify }));
vi.mock("@/lib/mov-convert", async (orig) => ({ ...(await orig()), convertMovToMp4: m.convert }));
vi.mock("@/lib/live-commerce", () => ({ getLiveCommerceRule: vi.fn() }));
import { vipArtworkForm } from "./vip-artwork-form";
import { POST } from "../app/api/uploads/route.js";
const upload = (file) => POST(new Request("https://portal.test/api/uploads", { method: "POST", body: vipArtworkForm({ privilege: { label: "VIP gifts", category: "GIFTS" }, file, price: "100", senderXp: "5", receiverXp: "8" }) }));
beforeEach(() => {
  vi.clearAllMocks();
  m.permission.mockResolvedValue(null); m.auth.mockResolvedValue({ user: { id: "admin", name: "Admin" } }); m.limited.mockReturnValue(false);
  m.duplicate.mockResolvedValue(null); m.lock.mockResolvedValue(1);
  m.validate.mockResolvedValue({ version: "2.0", width: 100, height: 100 });
  m.poster.mockImplementation(async file => file?.size ? { posterFileData: Buffer.from("webp"), posterFileSize: 4, posterMimeType: "image/webp", posterFileName: "poster.webp" } : null);
  m.create.mockImplementation(async ({ data }) => m.row = { ...data, id: "internal", createdAt: new Date(), updatedAt: new Date(), assignments: [] });
  Object.assign(m.db, { $transaction: async work => work(m.db), $executeRaw: m.lock, uploadAsset: { findFirst: m.duplicate, create: m.create, findUniqueOrThrow: async () => m.row }, auditLog: { create: m.audit } });
  m.mirror.mockImplementation(async (_db, asset) => asset);
});
it("converts VIP MOV uploads and stores them as MP4", async () => {
  m.convert.mockResolvedValue(Buffer.from("converted-mp4"));
  const response = await upload(new File(["movbytes"], "Gift.mov", { type: "video/quicktime" }));
  expect(response.status).toBe(201);
  expect(m.convert).toHaveBeenCalledWith(Buffer.from("movbytes"));
  expect(m.create.mock.calls[0][0].data).toMatchObject({ mimeType: "video/mp4", fileName: "Gift.mp4", fileData: Buffer.from("converted-mp4"), fileSize: 13 });
  expect((await response.json()).data.asset.mimeType).toBe("video/mp4");
});
it("returns a clear error when ffmpeg is missing", async () => {
  m.convert.mockRejectedValue(Object.assign(new Error("MOV needs ffmpeg on the server. Upload an MP4 instead."), { code: "FFMPEG_UNAVAILABLE", status: 503 }));
  const response = await upload(new File(["movbytes"], "Gift.mov", { type: "video/quicktime" }));
  expect(response.status).toBe(503);
  expect((await response.json()).error.message).toContain("MOV needs ffmpeg on the server");
  expect(m.create).not.toHaveBeenCalled();
});
it("rejects non-video MOV and oversized MOV files", async () => {
  m.convert.mockRejectedValue(Object.assign(new Error("This .mov file is not a valid QuickTime video."), { code: "UNSUPPORTED_MEDIA_TYPE", status: 415 }));
  expect((await upload(new File(["text"], "a.mov", { type: "video/quicktime" }))).status).toBe(415);
  m.convert.mockReset();
  expect((await upload(new File([Buffer.alloc(15 * 1024 * 1024 + 1)], "big.mov", { type: "video/quicktime" }))).status).toBe(413);
  expect(m.convert).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
});
