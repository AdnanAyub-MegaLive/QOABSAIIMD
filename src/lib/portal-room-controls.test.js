import { describe, it, expect, vi } from "vitest";
import { applyPortalRoomControl } from "./portal-room-controls";

const admin = { id: "admin-1", name: "Portal Admin" };
const input = { roomId: "ROOM-1", publicId: "USR-2", seatId: "row0-seat2", reason: "Moderation test", action: "FORCE_MUTE" };
function fixture() {
  const room = { id: "room", roomId: "ROOM-1", ownerId: "owner", revision: 1, updatedAt: new Date() };
  const tx = {
    audioRoom: { findUnique: vi.fn().mockResolvedValue(room), update: vi.fn().mockResolvedValue(room) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "target", publicId: "USR-2", status: "ACTIVE", deletedAt: null }) },
    audioRoomRole: { upsert: vi.fn(), deleteMany: vi.fn() },
    audioRoomBan: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn(), create: vi.fn() },
    audioRoomSeat: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    audioRoomMember: { updateMany: vi.fn() },
    audioRoomModerationLog: { create: vi.fn() }, auditLog: { create: vi.fn() },
  };
  return { tx, db: { $transaction: vi.fn(fn => fn(tx)) } };
}
describe("portal room controls", () => {
  it("force mutes the expected occupant and logs the real portal actor", async () => {
    const { tx, db } = fixture(); await applyPortalRoomControl(db, admin, input);
    expect(tx.audioRoomSeat.updateMany).toHaveBeenCalledWith({ where: { audioRoomId: "room", seatId: "row0-seat2", occupantUserId: "target" }, data: expect.objectContaining({ isForceMuted: true, isMuted: true }) });
    expect(tx.audioRoomModerationLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminActorId: admin.id, targetId: "target", action: "FORCE_MUTE" }) });
  });
  it("rejects stale seats without recording success", async () => {
    const { tx, db } = fixture(); tx.audioRoomSeat.updateMany.mockResolvedValue({ count: 0 });
    await expect(applyPortalRoomControl(db, admin, input)).rejects.toMatchObject({ code: "SEAT_CHANGED" });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it("allows the mic without remotely switching it on", async () => {
    const { tx, db } = fixture(); await applyPortalRoomControl(db, admin, { ...input, action: "ALLOW_MIC" });
    expect(tx.audioRoomSeat.updateMany.mock.calls[0][0].data).toMatchObject({ isMuted: true, isForceMuted: false });
  });
  it("seat removal does not remove room membership", async () => {
    const { tx, db } = fixture(); await applyPortalRoomControl(db, admin, { ...input, action: "SEAT_KICK" });
    expect(tx.audioRoomSeat.updateMany.mock.calls[0][0].data.occupantUserId).toBe(null);
    expect(tx.audioRoomMember.updateMany).not.toHaveBeenCalled();
  });
  it("bans with expiry, clears membership and preserves prior ban records", async () => {
    const { tx, db } = fixture(); await applyPortalRoomControl(db, admin, { ...input, action: "BAN", durationMinutes: 60 });
    expect(tx.audioRoomBan.create.mock.calls[0][0].data).toMatchObject({ adminActorId: admin.id, expiresAt: expect.any(Date) });
    expect(tx.audioRoomMember.updateMany.mock.calls[0][0].data.socketCount).toBe(0);
    expect(tx.audioRoomBan.updateMany.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });
  it("protects the room owner", async () => {
    const { tx, db } = fixture(); tx.user.findUnique.mockResolvedValue({ id: "owner" });
    await expect(applyPortalRoomControl(db, admin, input)).rejects.toMatchObject({ code: "ROOM_OWNER_PROTECTED" });
    expect(tx.audioRoomSeat.updateMany).not.toHaveBeenCalled();
  });
  it("assigns admin without impersonating the room owner", async () => {
    const { tx, db } = fixture(); await applyPortalRoomControl(db, admin, { ...input, action: "GRANT_ADMIN" });
    expect(tx.audioRoomRole.upsert.mock.calls[0][0].create).toMatchObject({ grantedById: null, adminGrantorId: admin.id, role: "ADMIN" });
  });
  it("rejects admin assignment to a banned user", async () => {
    const { tx, db } = fixture(); tx.audioRoomBan.findFirst.mockResolvedValue({ id: "ban" });
    await expect(applyPortalRoomControl(db, admin, { ...input, action: "GRANT_ADMIN" })).rejects.toMatchObject({ code: "ROOM_BANNED" });
    expect(tx.audioRoomRole.upsert).not.toHaveBeenCalled();
  });
  it("revokes only the selected room role", async () => {
    const { tx, db } = fixture(); await applyPortalRoomControl(db, admin, { ...input, action: "REVOKE_ADMIN" });
    expect(tx.audioRoomRole.deleteMany).toHaveBeenCalledWith({ where: { audioRoomId: "room", userId: "target" } });
  });
  it.each([-1, 0.5, 525601, undefined])("rejects invalid ban duration %s", async durationMinutes => {
    const { db } = fixture(); await expect(applyPortalRoomControl(db, admin, { ...input, action: "BAN", durationMinutes })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("retries serialization conflicts", async () => {
    const { db } = fixture(); db.$transaction.mockRejectedValueOnce({ code: "P2034" });
    await applyPortalRoomControl(db, admin, input); expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
});
