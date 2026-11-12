import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./realtime.js", () => ({ emitToVideoLive: vi.fn() }));
import { videoSetup, requireVideoAccess } from "./video-access.js";
import { freeGuestSlot } from "./video-guests.js";
import { videoPkQueue, videoPkMode } from "./video-pk.js";
import { kycDto, validateKycFields, submitKyc, reviewKyc } from "./host-kyc.js";
import { notifyLiveFollowers } from "./video-follower-alerts.js";
const live = { id: "live", publicId: "LIVE-1", hostId: "host", status: "LIVE", privacyMode: "PUBLIC", host: { publicId: "USR-H", name: "Host", profileImage: null }, title: "Hello", coverUrl: null };
function accessDb() { return { userBlock: { findFirst: vi.fn().mockResolvedValue(null) }, videoLiveBan: { findFirst: vi.fn().mockResolvedValue(null) }, userFollow: { findUnique: vi.fn().mockResolvedValue(null) }, videoLiveInvite: { findUnique: vi.fn().mockResolvedValue(null) } }; }
describe("live setup and access", () => {
  it("defaults legacy starts to public solo chat and validates all fields", () => {
    expect(videoSetup({})).toEqual({ announcement: null, category: "CHAT", privacyMode: "PUBLIC", mode: "SOLO" });
    expect(videoSetup({}, true)).toEqual({});
    for (const input of [{ announcement: "a".repeat(301) }, { category: "FAKE" }, { privacyMode: "SECRET" }, { mode: "TEAM" }]) expect(() => videoSetup(input)).toThrow();
  });
  it("enforces follower direction and private invitations", async () => {
    const db = accessDb();
    await expect(requireVideoAccess(db, { ...live, privacyMode: "FOLLOWERS" }, "viewer")).rejects.toMatchObject({ code: "LIVE_FOLLOW_REQUIRED" });
    expect(db.userFollow.findUnique).toHaveBeenCalledWith({ where: { followerId_followedId: { followerId: "viewer", followedId: "host" } } });
    db.userFollow.findUnique.mockResolvedValue({});
    await expect(requireVideoAccess(db, { ...live, privacyMode: "FOLLOWERS" }, "viewer")).resolves.toBeUndefined();
    await expect(requireVideoAccess(db, { ...live, privacyMode: "PRIVATE" }, "viewer")).rejects.toMatchObject({ code: "LIVE_INVITE_REQUIRED" });
    db.videoLiveInvite.findUnique.mockResolvedValue({});
    await expect(requireVideoAccess(db, { ...live, privacyMode: "PRIVATE" }, "viewer")).resolves.toBeUndefined();
  });
  it("blocks banned users even when they have an invitation", async () => {
    const db = accessDb(); db.videoLiveInvite.findUnique.mockResolvedValue({}); db.videoLiveBan.findFirst.mockResolvedValue({});
    await expect(requireVideoAccess(db, { ...live, privacyMode: "PRIVATE" }, "viewer")).rejects.toMatchObject({ code: "LIVE_BANNED" });
  });
  it("offers eight group guest slots while preserving the solo limit", async () => {
    const tx = { videoLiveGuestRequest: { findMany: vi.fn().mockResolvedValue([1,2,3,4].map(slot => ({ slot }))) }, videoLiveSession: { findUnique: vi.fn().mockResolvedValue({ mode: "GROUP" }) } };
    expect(await freeGuestSlot(tx, "live")).toBe(5);
    tx.videoLiveSession.findUnique.mockResolvedValue({ mode: "SOLO" });
    await expect(freeGuestSlot(tx, "live")).rejects.toThrow("GUEST_SLOTS_FULL");
    tx.videoLiveSession.findUnique.mockResolvedValue({ mode: "GROUP" }); tx.videoLiveGuestRequest.findMany.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ slot: i + 1 })));
    await expect(freeGuestSlot(tx, "live")).rejects.toThrow("GUEST_SLOTS_FULL");
  });
});
describe("PK random matching", () => {
  it("reserves future modes without silently treating teams as 1V1", () => { expect(videoPkMode()).toBe("1V1"); expect(() => videoPkMode("2V2")).toThrow("Only 1V1"); });
  it("matches two consenting hosts atomically and clears both queue entries", async () => {
    const other = { ...live, id: "other", publicId: "LIVE-2", hostId: "other-host" };
    const tx = { ...accessDb(), $queryRaw: vi.fn(), videoLiveSession: { findUnique: vi.fn().mockResolvedValue(live) }, videoLivePkQueue: { deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([{ sessionId: other.id, session: other }]) }, videoLivePkSession: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(async ({ data }) => ({ ...data, leftScore: 0n, rightScore: 0n, revision: 0, leftSession: other, rightSession: live })) } };
    const result = await videoPkQueue({ $transaction: fn => fn(tx) }, { id: "host" }, live.publicId, { action: "JOIN" });
    expect(result.status).toBe("MATCHED"); expect(result.pk.status).toBe("LIVE");
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.videoLivePkQueue.deleteMany).toHaveBeenLastCalledWith({ where: { sessionId: { in: ["live", "other"] } } });
  });
});
function kycDb(overrides = {}) {
  const tx = { $queryRaw: vi.fn(), user: { findUnique: vi.fn().mockResolvedValue({ id: "u", publicId: "USR-1", appRoles: ["HOST"], isVerified: false }), update: vi.fn() }, talent: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() }, talentVerification: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0), create: vi.fn().mockImplementation(async ({ data }) => ({ ...data, id: "kyc", submittedAt: new Date() })), findUnique: vi.fn(), update: vi.fn() }, kycImage: { create: vi.fn().mockResolvedValue({ id: "private" }) }, auditLog: { create: vi.fn() }, notification: { upsert: vi.fn() }, ...overrides };
  return { tx, db: { $transaction: fn => fn(tx) } };
}
describe("host KYC", () => {
  it("validates fields and returns NONE for unsubmitted users", () => {
    expect(kycDto({ isVerified: false }, null)).toMatchObject({ status: "NONE", idType: null });
    expect(() => validateKycFields("ab", "PASSPORT")).toThrow(); expect(() => validateKycFields("Name", "FAKE")).toThrow();
  });
  it("allows a host without a legacy Talent and stores private image references", async () => {
    const { db, tx } = kycDb();
    const result = await submitKyc(db, "u", { legalName: "Host Name", idType: "PASSPORT" }, { identityCardFront: Buffer.from("image"), profileImage: Buffer.from("selfie") });
    expect(result.status).toBe("PENDING");
    expect(tx.talentVerification.create.mock.calls[0][0].data).toMatchObject({ talentId: null, userId: "u", identityCardFront: "kyc:private" });
    expect(result).not.toHaveProperty("identityCardFront");
  });
  it.each([["KYC_ALREADY_VERIFIED", "verified"], ["KYC_PENDING", "pending"], ["KYC_RATE_LIMITED", "rate"], ["KYC_HOST_REQUIRED", "role"]])("rejects %s before storing files", async (code, state) => {
    const { db, tx } = kycDb();
    if (state === "verified") tx.user.findUnique.mockResolvedValue({ id: "u", publicId: "USR-1", appRoles: ["HOST"], isVerified: true });
    if (state === "pending") tx.talentVerification.findFirst.mockResolvedValue({});
    if (state === "rate") tx.talentVerification.count.mockResolvedValue(3);
    if (state === "role") tx.user.findUnique.mockResolvedValue({ id: "u", publicId: "USR-1", appRoles: [] });
    await expect(submitKyc(db, "u", {}, {})).rejects.toMatchObject({ code }); expect(tx.kycImage.create).not.toHaveBeenCalled();
  });
  it("approves the user, records reviewer, audits and notifies in one transaction", async () => {
    const { db, tx } = kycDb(); tx.talentVerification.findUnique.mockResolvedValue({ id: "k", userId: "u", status: "PENDING" });
    tx.talentVerification.update.mockImplementation(async ({ data }) => ({ id: "k", ...data }));
    const result = await reviewKyc(db, { id: "admin" }, "k", "APPROVE");
    expect(result.status).toBe("APPROVED"); expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "u" }, data: { isVerified: true } });
    expect(tx.talentVerification.update.mock.calls[0][0].data.reviewedById).toBe("admin"); expect(tx.auditLog.create).toHaveBeenCalled(); expect(tx.notification.upsert).toHaveBeenCalled();
  });
  it("requires rejection reasons and refuses a second review", async () => {
    const { db, tx } = kycDb(); await expect(reviewKyc(db, { id: "a" }, "k", "REJECT", " ")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    tx.talentVerification.findUnique.mockResolvedValue({ status: "APPROVED" });
    await expect(reviewKyc(db, { id: "a" }, "k", "REJECT", "Unreadable")).rejects.toMatchObject({ code: "KYC_ALREADY_REVIEWED" });
  });
});
describe("follower alerts", () => {
  it("batches accessible followers with stable recipient keys and starts the cooldown", async () => {
    const tx = { $queryRaw: vi.fn(), videoLiveAlertCooldown: { findUnique: async () => null, upsert: vi.fn() }, userFollow: { findMany: async () => [{ followerId: "ok" }, { followerId: "blocked" }, { followerId: "banned" }] }, userBlock: { findMany: async () => [{ blockerId: "blocked", blockedId: "host" }] }, videoLiveBan: { findMany: async () => [{ userId: "banned" }] }, notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    expect(await notifyLiveFollowers({ $transaction: fn => fn(tx) }, live)).toBe(1);
    expect(tx.notification.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(tx.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({ userId: "ok", sourceKey: "ok:live-start:LIVE-1", body: "Host is live: Hello" });
    expect(tx.videoLiveAlertCooldown.upsert).toHaveBeenCalled();
  });
  it("applies a rolling host cooldown across live sessions", async () => {
    const tx = { $queryRaw: vi.fn(), videoLiveAlertCooldown: { findUnique: vi.fn().mockResolvedValue({ sentAt: new Date() }) }, userFollow: { findMany: vi.fn() } };
    expect(await notifyLiveFollowers({ $transaction: fn => fn(tx) }, live)).toBe(0); expect(tx.userFollow.findMany).not.toHaveBeenCalled();
  });
  it("does not alert followers who cannot access a private live", async () => {
    const tx = { userBlock:{findMany:async()=>[]},videoLiveBan:{findMany:async()=>[]},videoLiveInvite:{findMany:async()=>[]},userFollow:{}, $queryRaw: vi.fn(), videoLiveAlertCooldown: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() }, notification: { upsert: vi.fn() } };
    tx.userFollow.findMany = vi.fn().mockResolvedValue([{ followerId: "viewer" }]);
    expect(await notifyLiveFollowers({ $transaction: fn => fn(tx) }, { ...live, privacyMode: "PRIVATE" })).toBe(0); expect(tx.notification.upsert).not.toHaveBeenCalled();
  });
});
it("applies the migration without losing existing sessions or verification rows", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "User" (id TEXT PRIMARY KEY); CREATE TABLE "VideoLiveSession" (id TEXT PRIMARY KEY, status TEXT, "endedAt" TIMESTAMP); CREATE TABLE "VideoLivePkSession" (id TEXT PRIMARY KEY); CREATE TABLE "TalentVerification" (id TEXT PRIMARY KEY, "talentId" TEXT NOT NULL, "submittedAt" TIMESTAMP); INSERT INTO "VideoLiveSession" VALUES (\'old\', \'LIVE\', NULL);');
    await db.exec(readFileSync(new URL("../../prisma/migrations/20261112200000_live_journey_kyc/migration.sql", import.meta.url), "utf8"));
    expect((await db.query('SELECT "mode", "privacyMode", "category" FROM "VideoLiveSession"')).rows[0]).toEqual({ mode: "SOLO", privacyMode: "PUBLIC", category: "CHAT" });
  } finally { await db.close(); }
});
