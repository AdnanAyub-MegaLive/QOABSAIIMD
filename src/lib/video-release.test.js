import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { decodeLiveCover, validateLiveCover } from "./video-cover.js";
import { freeGuestSlot, respondVideoInvite } from "./video-guests.js";
import { endStaleVideoLives } from "./live-maintenance.js";

it("decodes and re-encodes allowed covers and rejects disguised content", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  expect((await sharp(await decodeLiveCover(png, "image/png")).metadata()).format).toBe("webp");
  await expect(decodeLiveCover(png, "image/jpeg")).rejects.toThrow();
  await expect(decodeLiveCover(Buffer.from("<svg/>"), "image/png")).rejects.toThrow();
  await expect(decodeLiveCover(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png")).rejects.toThrow();
});
it("accepts only the caller's portal upload URLs", async () => {
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", path = `/api/v1/live-video/cover/${id}`;
  const db = { videoLiveCover: { findFirst: vi.fn(async () => ({ id })) } };
  expect(await validateLiveCover(`https://portal.test${path}`, "u", "https://portal.test", db)).toBe(path);
  expect(db.videoLiveCover.findFirst).toHaveBeenCalledWith({ where: { id, userId: "u" }, select: { id: true } });
  await expect(validateLiveCover(`https://evil.test${path}`, "u", "https://portal.test", db)).rejects.toThrow();
  db.videoLiveCover.findFirst.mockResolvedValue(null);
  await expect(validateLiveCover(path, "u", "https://portal.test", db)).rejects.toThrow();
});
it("reserves invitation slots alongside approved guests", async () => {
  const tx = { videoLiveGuestRequest: { findMany: vi.fn(async () => [{ slot: 1 }, { slot: 2 }, { slot: 3 }]) } };
  expect(await freeGuestSlot(tx, "live")).toBe(4);
  expect(tx.videoLiveGuestRequest.findMany.mock.calls[0][0].where.OR[1]).toMatchObject({ status: "INVITED" });
  tx.videoLiveGuestRequest.findMany.mockResolvedValue([1, 2, 3, 4].map(slot => ({ slot })));
  await expect(freeGuestSlot(tx, "live")).rejects.toThrow("GUEST_SLOTS_FULL");
});
it("rejects expired or another user's invite", async () => {
  const tx = { videoLiveSession: { findUnique: async () => ({ id: "s", status: "LIVE" }) }, videoLiveBan: { findFirst: async () => null }, videoLiveGuestRequest: { findFirst: vi.fn(async () => null) } };
  await expect(respondVideoInvite("LIVE-1", "user", true, { $transaction: work => work(tx) })).rejects.toThrow("GUEST_REQUEST_UNAVAILABLE");
  expect(tx.videoLiveGuestRequest.findFirst.mock.calls[0][0].where).toMatchObject({ userId: "user", status: "INVITED", expiresAt: { gt: expect.any(Date) } });
});
it("does not end a live whose heartbeat won the race", async () => {
  const tx = { videoLiveSession: { updateMany: vi.fn(async () => ({ count: 0 })) }, videoLiveViewer: { updateMany: vi.fn() } };
  const db = { videoLiveSession: { findMany: async () => [{ id: "s", publicId: "LIVE-1" }] }, $transaction: work => work(tx) };
  expect(await endStaleVideoLives(new Date(), 90000, db)).toEqual({ ended: 0 });
  expect(tx.videoLiveViewer.updateMany).not.toHaveBeenCalled();
  expect(tx.videoLiveSession.updateMany.mock.calls[0][0].where.hostLastSeenAt.lte).toBeInstanceOf(Date);
});
