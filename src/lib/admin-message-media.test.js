import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), message: vi.fn(), media: vi.fn(), audit: vi.fn(), voice: vi.fn(), object: vi.fn() }));
vi.mock("./portal-admin.js", () => ({ requirePermission: m.permission }));
vi.mock("./prisma.js", () => ({ prisma: { message: { findUnique: m.message }, chatMediaObject: { findUnique: m.media }, auditLog: { create: m.audit } } }));
vi.mock("./voice-storage.js", () => ({ voiceObject: m.voice }));
vi.mock("./chat-media.js", () => ({ privateChatObject: m.object }));
import { adminMessageMedia } from "./admin-message-media.js";
const call = (mode = "media", headers = {}, query = "") => adminMessageMedia(new Request(`https://portal.test/api/admin/messages/MSG-1/${mode}${query}`, { headers }), { params: Promise.resolve({ messagePublicId: "MSG-1" }) }, mode);
const object = () => ({ ContentLength: 3, Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1,2,3])); c.close(); } }) } });
beforeEach(() => {
  vi.resetAllMocks();
  m.permission.mockResolvedValue({ id: "admin" });
  m.message.mockResolvedValue({ publicId: "MSG-1", kind: "video", mediaId: "media", conversationId: "chat", deletedAt: new Date() });
  m.media.mockResolvedValue({ ready: true, conversationId: "chat", key: "private-chat/video.mp4", posterKey: "private-chat/poster.jpg", mimeType: "video/mp4" });
  m.object.mockImplementation(async () => object()); m.voice.mockImplementation(async () => object());
});
it.each([401, 403])("refuses unauthorized media access (%s) before lookup", async status => {
  m.permission.mockRejectedValue({ status });
  expect((await call()).status).toBe(status);
  expect(m.message).not.toHaveBeenCalled(); expect(m.object).not.toHaveBeenCalled();
});
it("streams retained deleted media with range and audit", async () => {
  m.object.mockResolvedValue({ ...object(), ContentRange: "bytes 0-2/10" });
  const res = await call("media", { range: "bytes=0-2" });
  expect(res.status).toBe(206); expect(res.headers.get("content-range")).toBe("bytes 0-2/10");
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(m.permission).toHaveBeenCalledWith("messages.view");
  expect(m.object).toHaveBeenCalledWith("get", "private-chat/video.mp4", { range: "bytes=0-2" });
  expect(m.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ adminId: "admin", entityId: "MSG-1", metadata: { deleted: true, range: "bytes=0-2" } }) });
  expect((await res.arrayBuffer()).byteLength).toBe(3);
});
it("serves posters through the same audited permission boundary", async () => {
  const res = await call("media", {}, "?poster=1");
  expect(res.headers.get("content-type")).toBe("image/jpeg");
  expect(m.object).toHaveBeenCalledWith("get", "private-chat/poster.jpg", { range: null });
});
it("streams voice without exposing its storage key", async () => {
  m.message.mockResolvedValue({ publicId: "MSG-1", kind: "voice", voiceKey: "private-voice/test.m4a" });
  const res = await call("voice"); expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("audio/mp4");
  expect(m.voice).toHaveBeenCalledWith("get", "private-voice/test.m4a");
  expect(JSON.stringify(m.audit.mock.calls)).not.toContain("private-voice");
});
it("rejects unrelated objects and malformed ranges", async () => {
  expect((await call("media", { range: "bytes=0-1,4-5" })).status).toBe(416);
  m.media.mockResolvedValue({ ready: true, conversationId: "different" });
  expect((await call()).status).toBe(404); expect(m.object).not.toHaveBeenCalled();
});
it("handles pruned objects and storage range errors", async () => {
  m.object.mockRejectedValueOnce({ name: "NoSuchKey" }).mockRejectedValueOnce({ name: "InvalidRange" });
  expect((await call()).status).toBe(404); expect((await call()).status).toBe(416);
});
it("does not serve files if auditing fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  m.audit.mockRejectedValue(new Error("db unavailable"));
  expect((await call()).status).toBe(500); expect(m.object).not.toHaveBeenCalled(); log.mockRestore();
});
