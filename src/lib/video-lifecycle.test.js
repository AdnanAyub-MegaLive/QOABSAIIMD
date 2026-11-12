import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ dismiss: vi.fn(), remove: vi.fn(), emit: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./rtc-moderation.js", () => ({ dismissRtcRoom: mocks.dismiss, removeRtcParticipant: mocks.remove }));
vi.mock("./realtime.js", () => ({ emitToVideoLive: mocks.emit }));
import { endVideoLive, closeVideoRtc } from "./video-lifecycle.js";
afterEach(() => { vi.clearAllMocks(); });
it("ends database state and broadcasts before closing the provider room", async () => {
  const row = { id: "s", publicId: "LIVE-1", status: "ENDED", endedAt: new Date(), revision: 2 };
  const tx = { $queryRaw: vi.fn(), videoLiveSession: { updateMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(row) }, videoLiveViewer: { updateMany: vi.fn() }, videoLiveGuestRequest: { updateMany: vi.fn() }, videoLivePkQueue: { deleteMany: vi.fn() }, videoLivePkSession: { updateMany: vi.fn() }, auditLog: { create: vi.fn() } };
  const update = vi.fn(), db = { $transaction: fn => fn(tx), videoLiveSession: { update } };
  await endVideoLive({ id: "s" }, { id: "admin" }, db);
  expect(tx.auditLog.create).toHaveBeenCalled(); expect(tx.videoLiveViewer.updateMany).toHaveBeenCalledWith({ where: { sessionId: "s" }, data: { active: false, socketCount: 0 } });
  expect(mocks.emit).toHaveBeenCalledWith("LIVE-1", "live-video:ended", expect.any(Object));
  expect(mocks.dismiss).toHaveBeenCalledWith("video-LIVE-1"); expect(update.mock.calls[0][0].data.rtcClosedAt).toBeInstanceOf(Date);
});
it("leaves provider cleanup pending when the RTC service fails", async () => {
  const update = vi.fn(); mocks.dismiss.mockRejectedValueOnce(new Error("unavailable"));
  await expect(closeVideoRtc({ id: "s", publicId: "LIVE-1" }, { videoLiveSession: { update } })).rejects.toThrow("unavailable");
  expect(update).not.toHaveBeenCalled();
});
