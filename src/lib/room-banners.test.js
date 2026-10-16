import { beforeEach, expect, it, vi } from "vitest";
const { db, object } = vi.hoisted(() => ({ db: {}, object: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: db }));
vi.mock("./room-banner-media.js", () => ({ bannerError: (code, message, status) => Object.assign(Error(message), { code, status }), bannerObject: object }));
vi.mock("./realtime.js", () => ({ emitToAudioRoom: vi.fn() }));
import { submitBanner, changeBanner, validateBannerSettings, publicBanner, reorderBanners, maintainRoomBanners } from "./room-banners.js";
let rows, balance, ledger;
const args = () => ({ roomId: "ROOM-1", userId: "owner", requestId: "request-1", packageId: "week", settingsRevision: 1, media: { bytes: Buffer.from("image"), mimeType: "image/webp", mediaVersion: "hash" } });
beforeEach(() => {
  rows = []; balance = 1000n; ledger = []; object.mockReset().mockResolvedValue("https://media.example/test.webp");
  Object.assign(db, {
    $queryRaw: vi.fn(async () => []),
    audioRoom: { findUnique: vi.fn(async () => ({ id: "room", roomId: "ROOM-1", ownerId: "owner" })), update: vi.fn() },
    roomBannerSettings: { findUnique: vi.fn(async () => ({ enabled: true, revision: 1, packages: [{ id: "week", name: "Week", durationDays: 7, coins: "100" }] })) },
    roomBanner: {
      findUnique: vi.fn(async ({ where }) => rows.find(r => r.ownerId === where.ownerId_requestId.ownerId && r.requestId === where.ownerId_requestId.requestId)),
      findMany: vi.fn(async () => rows.filter(r => r.status === "PENDING" || r.status === "ACTIVE")),
      findFirst: vi.fn(async ({ where }) => rows.find(r => r.id === where.id && r.audioRoomId === where.audioRoomId)),
      create: vi.fn(async ({ data }) => { const row = { id: `b${rows.length}`, status: "PENDING", ...data }; rows.push(row); return row; }),
      update: vi.fn(async ({ where, data }) => { const row = rows.find(r => r.id === where.id); Object.assign(row, data); return row; }),
    },
    user: { updateMany: vi.fn(async ({ data }) => { const cost = data.coinBalance.decrement; if (balance < cost) return { count: 0 }; balance -= cost; return { count: 1 }; }), update: vi.fn(async ({ data }) => { balance += data.coinBalance.increment; }) },
    walletTransaction: { create: vi.fn(async ({ data }) => ledger.push(data)) },
    auditLog: { create: vi.fn() }, notification: { upsert: vi.fn() },
  });
  db.$transaction = async fn => { const prior = structuredClone({ rows, balance, ledger }); try { return await fn(db); } catch (e) { ({ rows, balance, ledger } = prior); throw e; } };
});
it("charges once and replays a request, rejecting changed content", async () => {
  const first = await submitBanner(args()); expect(await submitBanner(args())).toEqual(first);
  expect(balance).toBe(900n); expect(ledger).toHaveLength(1); expect(object).toHaveBeenCalledTimes(1);
  await expect(submitBanner({ ...args(), media: { ...args().media, bytes: Buffer.from("other") } })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("pending banners consume both slots before a third can charge", async () => {
  await submitBanner(args()); await submitBanner({ ...args(), requestId: "two" });
  await expect(submitBanner({ ...args(), requestId: "three" })).rejects.toMatchObject({ code: "BANNER_LIMIT_REACHED" }); expect(balance).toBe(800n);
});
it("rejects non-owners and stale prices before payment", async () => {
  await expect(submitBanner({ ...args(), userId: "admin" })).rejects.toMatchObject({ code: "ROOM_OWNER_ONLY" });
  await expect(submitBanner({ ...args(), settingsRevision: 0 })).rejects.toMatchObject({ code: "BANNER_PRICE_CHANGED" }); expect(balance).toBe(1000n);
});
it("storage failures roll back the debit and insufficient funds never upload", async () => {
  object.mockRejectedValueOnce(Error("Storage down")); await expect(submitBanner(args())).rejects.toThrow("Storage down"); expect(balance).toBe(1000n); expect(rows).toHaveLength(0); expect(ledger).toHaveLength(0);
  balance = 0n; await expect(submitBanner(args())).rejects.toMatchObject({ code: "INSUFFICIENT_COINS" }); expect(object).toHaveBeenCalledTimes(1);
});
it("pending cancellation refunds exactly once", async () => {
  const b = await submitBanner(args()); const change = { roomId: "ROOM-1", id: b.id, action: "DELETE", userId: "owner" };
  await changeBanner(change); await changeBanner(change); expect(balance).toBe(1000n); expect(ledger).toHaveLength(2);
});
it("approval starts paid duration and duplicate approval does not extend it", async () => {
  const b = await submitBanner(args());
  object.mockResolvedValueOnce({ Body: { transformToByteArray: async () => Buffer.from("image") } }).mockResolvedValueOnce("https://media.example/banner.webp");
  const change = { roomId: "ROOM-1", id: b.id, action: "APPROVE", adminId: "admin" };
  const result = await changeBanner(change);
  expect(result.status).toBe("ACTIVE"); expect(result.imageUrl).toContain("?v=hash");
  expect(result.expiresAt.getTime() - rows[0].reviewedAt.getTime()).toBe(7 * 86400000);
  expect((await changeBanner(change)).expiresAt).toEqual(result.expiresAt); expect(balance).toBe(900n); expect(ledger).toHaveLength(1);
});
it("admin rejection requires a reason and refunds, active deletion does not", async () => {
  const b = await submitBanner(args()); const change = { roomId: "ROOM-1", id: b.id, action: "REJECT", adminId: "admin" };
  await expect(changeBanner(change)).rejects.toMatchObject({ code: "VALIDATION_ERROR" }); await changeBanner({ ...change, reason: "Not appropriate" }); expect(balance).toBe(1000n);
  const active = await submitBanner({ ...args(), requestId: "new" }); rows.find(r => r.id === active.id).status = "ACTIVE";
  await changeBanner({ roomId: "ROOM-1", id: active.id, userId: "owner", action: "DELETE" }); expect(balance).toBe(900n);
});
it("validates package settings and prevents private fields leaking", () => {
  expect(() => validateBannerSettings({ enabled: true, packages: [] })).toThrow();
  expect(() => validateBannerSettings({ enabled: true, packages: [{ id: "x", name: "X", durationDays: 7, coins: "0" }] })).toThrow();
  expect(publicBanner({ id: "b", coins: 100n, storageKey: "private", ownerId: "secret", requestId: "secret" })).not.toHaveProperty("coins");
  expect(publicBanner({ storageKey: "private" })).not.toHaveProperty("storageKey");
});
it("validates reorder membership and denies non-owner moderation", async () => {
  const b = await submitBanner(args()); await expect(reorderBanners("ROOM-1", "owner", ["foreign"])).rejects.toMatchObject({ code: "BANNER_LIST_CHANGED" });
  await expect(changeBanner({ roomId: "ROOM-1", id: b.id, action: "APPROVE", userId: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("expires banners and broadcasts the canonical empty snapshot without payment data", async () => {
  const expired = { id: "expired", ownerId: "owner", status: "ACTIVE", expiresAt: new Date(0), room: { roomId: "ROOM-1" } };
  db.roomBannerObject = { findMany: vi.fn(async () => []) };
  db.roomBanner.findMany.mockImplementation(async ({ where }) => where.remindedAt === null || expired.status === "EXPIRED" ? [] : [expired]);
  db.roomBanner.updateMany = vi.fn(async () => { expired.status = "EXPIRED"; return { count: 1 }; });
  db.audioRoom.findUnique.mockResolvedValue({ id: "room", roomId: "ROOM-1", bannerRevision: 2, banners: [] });
  db.audioRoom.updateMany = vi.fn();
  db.$queryRaw.mockImplementation(async parts => parts[0].includes('SELECT "roomId"') ? [{ roomId: "ROOM-1" }] : []);
  const emit = vi.fn(); globalThis.portalIo = { to: vi.fn(() => ({ emit })) };
  try {
    await maintainRoomBanners(db);
    expect(expired.status).toBe("EXPIRED"); expect(db.user.update).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("audio-room:banners-changed", { success: true, data: { roomId: "ROOM-1", revision: 2, banners: [] } });
    expect(db.notification.upsert).toHaveBeenCalledTimes(1);
  } finally { delete globalThis.portalIo; }
});
