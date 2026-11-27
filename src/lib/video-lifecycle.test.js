import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ dismiss: vi.fn(), remove: vi.fn(), emit: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./rtc-moderation.js", () => ({ dismissRtcRoom: mocks.dismiss, removeRtcParticipant: mocks.remove }));
vi.mock("./realtime.js", () => ({ emitToVideoLive: mocks.emit }));
import { endVideoLive, closeVideoRtc } from "./video-lifecycle.js";
afterEach(() => { vi.clearAllMocks(); });
it.each([false, true])("ends and broadcasts even when provider cleanup fails (%s)", async (cleanupFails) => {
  if (cleanupFails) mocks.dismiss.mockRejectedValueOnce(new Error("RTC_MODERATION_FAILED"));
  const row = { id: "s", publicId: "LIVE-1", status: "ENDED", endedAt: new Date(), revision: 2 };
  const tx = { $queryRaw: vi.fn(), videoLiveSession: { updateMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(row) }, videoLiveViewer: { updateMany: vi.fn() }, videoLiveGuestRequest: { updateMany: vi.fn() }, videoLivePkQueue: { deleteMany: vi.fn() }, videoLiveAdmin: { deleteMany: vi.fn() }, videoLivePkSession: { updateMany: vi.fn() }, videoCoHostMember: { findMany: vi.fn().mockResolvedValue([]) }, auditLog: { create: vi.fn() } };
  const update = vi.fn(), db = { $transaction: fn => fn(tx), videoLiveSession: { update } };
  const result = await endVideoLive({ id: "s" }, { id: "admin" }, db);
  expect(result.status).toBe("ENDED");
  expect(tx.auditLog.create).toHaveBeenCalled(); expect(tx.videoLiveViewer.updateMany).toHaveBeenCalledWith({ where: { sessionId: "s" }, data: { active: false, socketCount: 0 } });
  expect(mocks.emit).toHaveBeenCalledWith("LIVE-1", "live-video:ended", expect.any(Object));
  expect(mocks.dismiss).toHaveBeenCalledWith("video-LIVE-1"); if (cleanupFails) expect(update).not.toHaveBeenCalled();
  else expect(update.mock.calls[0][0].data.rtcClosedAt).toBeInstanceOf(Date);
});
it("leaves provider cleanup pending when the RTC service fails", async () => {
  const update = vi.fn(); mocks.dismiss.mockRejectedValueOnce(new Error("unavailable"));
  await expect(closeVideoRtc({ id: "s", publicId: "LIVE-1" }, { videoLiveSession: { update } })).rejects.toThrow("unavailable");
  expect(update).not.toHaveBeenCalled();
});

describe("video RTC cleanup retries", () => {
  it("only retries sessions that ended in the last day", async () => {
    const { retryVideoRtcCleanup } = await import("./video-lifecycle.js");
    let where;
    await retryVideoRtcCleanup({ videoLiveSession: { findMany: async args => { where = args.where; return []; } } });
    expect(where.rtcClosedAt).toBeNull();
    expect(where.endedAt.gte.getTime()).toBeGreaterThan(Date.now() - 24 * 3600_000 - 5000);
  });
});
it("retries deferred cleanup and marks it complete only after provider success", async () => {
  const { retryVideoRtcCleanup } = await import("./video-lifecycle.js");
  const row = { id: "pending", publicId: "LIVE-PENDING", rtcClosedAt: null };
  const update = vi.fn();
  mocks.dismiss.mockResolvedValueOnce(undefined);
  await retryVideoRtcCleanup({ videoLiveSession: { findMany: vi.fn().mockResolvedValue([row]), update } });
  expect(mocks.dismiss).toHaveBeenCalledWith("video-LIVE-PENDING");
  expect(update).toHaveBeenCalledWith({ where: { id: "pending" }, data: { rtcClosedAt: expect.any(Date) } });
});
