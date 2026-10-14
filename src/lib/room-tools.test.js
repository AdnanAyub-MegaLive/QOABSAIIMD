import { describe, it, expect, vi } from "vitest";
import { normalizeRoomMix, roomMixSnapshot, setRoomMix, inviteToRoom, registerRoomTools } from "./room-tools.js";
function fixture() {
  const room = { id: "r", roomId: "ROOM-1", title: "Test", status: "LIVE", ownerId: "u", privacyMode: "PUBLIC" };
  const tx = {
    audioRoom: { findUnique: vi.fn().mockResolvedValue(room) },
    audioRoomRole: { findUnique: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn(),
    audioRoomEntertainmentState: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "v", publicId: "USR-2", status: "ACTIVE" }) },
    userBlock: { findFirst: vi.fn().mockResolvedValue(null) }, ban: { findFirst: vi.fn().mockResolvedValue(null) }, audioRoomBan: { findFirst: vi.fn().mockResolvedValue(null) },
    notification: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ publicId: "NOT-1" }) },
  };
  const db = { $transaction: work => work(tx) };
  const socket = { rooms: new Set(["audio-room:ROOM-1"]) };
  return { tx, db, socket, user: { id: "u", publicId: "USR-1", name: "Owner" } };
}
describe("room mix", () => {
  it("validates numbers and merges a partial update", () => {
    expect(normalizeRoomMix({ musicVolume: 40 }, { micVolume: 80 })).toEqual({ musicVolume: 40, micVolume: 80 });
    for (const value of [-1, 101, 1.5, "50", null, NaN]) expect(() => normalizeRoomMix({ micVolume: value })).toThrow();
    expect(() => normalizeRoomMix({})).toThrow();
    expect(roomMixSnapshot(null).revision).toBe(0);
  });
  it("does not write repeated values", async () => {
    const f = fixture();
    expect((await setRoomMix(f.db, f.socket, f.user, { roomId: "ROOM-1", micVolume: 100 })).changed).toBe(false);
    expect(f.tx.audioRoomEntertainmentState.upsert).not.toHaveBeenCalled();
  });
  it("persists a revision without modifying RTC permissions", async () => {
    const f = fixture();
    const result = await setRoomMix(f.db, f.socket, f.user, { roomId: "ROOM-1", micVolume: 30 });
    expect(result).toMatchObject({ micVolume: 30, musicVolume: 100, revision: 1, changed: true });
    expect(f.tx.audioRoomEntertainmentState.upsert).toHaveBeenCalledOnce();
  });
  it("requires joined owner", async () => {
    const f = fixture();
    await expect(setRoomMix(f.db, f.socket, { id: "other" }, { roomId: "ROOM-1", micVolume: 20 })).rejects.toMatchObject({ code: "ROOM_PERMISSION_DENIED" });
    f.socket.rooms.clear();
    await expect(setRoomMix(f.db, f.socket, f.user, { roomId: "ROOM-1", micVolume: 20 })).rejects.toMatchObject({ code: "JOIN_ROOM_FIRST" });
  });
});
describe("room invitations", () => {
  const input = { roomId: "ROOM-1", userId: "USR-2", requestId: "req-1" };
  it("stores an expiring notification and replays duplicates", async () => {
    const f = fixture();
    const result = await inviteToRoom(f.db, f.socket, f.user, input);
    expect(result).toMatchObject({ invitationId: "NOT-1", roomId: "ROOM-1", duplicate: false });
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    f.tx.notification.findUnique.mockResolvedValue({ publicId: "NOT-1", action: result });
    expect((await inviteToRoom(f.db, f.socket, f.user, input)).duplicate).toBe(true);
    expect(f.tx.notification.upsert).toHaveBeenCalledOnce();
  });
  it("rejects blocks, bans, inactive recipients and unprivileged members", async () => {
    const f = fixture();
    f.tx.userBlock.findFirst.mockResolvedValue({});
    await expect(inviteToRoom(f.db, f.socket, f.user, input)).rejects.toMatchObject({ code: "ROOM_INVITATION_UNAVAILABLE" });
    f.tx.userBlock.findFirst.mockResolvedValue(null);
    f.tx.ban.findFirst.mockResolvedValue({});
    await expect(inviteToRoom(f.db, f.socket, f.user, input)).rejects.toMatchObject({ code: "ROOM_INVITATION_UNAVAILABLE" });
    f.tx.ban.findFirst.mockResolvedValue(null);
    f.tx.user.findUnique.mockResolvedValue({ id: "v", status: "SUSPENDED" });
    await expect(inviteToRoom(f.db, f.socket, f.user, input)).rejects.toMatchObject({ code: "ROOM_INVITATION_UNAVAILABLE" });
    await expect(inviteToRoom(f.db, f.socket, { id: "other" }, input)).rejects.toMatchObject({ code: "ROOM_PERMISSION_DENIED" });
  });
  it("returns rate-limit acknowledgements", async () => {
    const handlers = {}, ack = vi.fn();
    registerRoomTools({ socket: { on: (name, handler) => { handlers[name] = handler; } }, user: { id: "u" }, isRateLimited: () => true });
    await handlers["audio-room:room-invite"](input, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.objectContaining({ code: "RATE_LIMITED" }) }));
  });
  it("allows delegated admins to invite but not change the owner's mix", async () => {
    const f = fixture();
    f.tx.audioRoomRole.findUnique.mockResolvedValue({ role: "ADMIN" });
    expect((await inviteToRoom(f.db, f.socket, { ...f.user, id: "admin" }, input)).invitationId).toBe("NOT-1");
    await expect(setRoomMix(f.db, f.socket, { ...f.user, id: "admin" }, { roomId: "ROOM-1", micVolume: 20 })).rejects.toMatchObject({ code: "ROOM_PERMISSION_DENIED" });
  });
  it("allows password prompts without granting access", async () => {
    const f = fixture();
    f.tx.audioRoom.findUnique.mockResolvedValue({ id: "r", roomId: "ROOM-1", title: "Locked", ownerId: "u", status: "LIVE", passwordHash: "not-exposed" });
    const result = await inviteToRoom(f.db, f.socket, f.user, input);
    expect(JSON.stringify(result)).not.toContain("not-exposed");
    expect(result.invitationId).toBe("NOT-1");
  });
  it("broadcasts changed mix to the whole room and acknowledges it", async () => {
    const f = fixture(), handlers = {}, ack = vi.fn(), emit = vi.fn(), io = { to: vi.fn(() => ({ emit })) };
    f.socket.on = (name, handler) => { handlers[name] = handler; };
    registerRoomTools({ ...f, io, isRateLimited: () => false });
    await handlers["audio-room:mix-set"]({ roomId: "ROOM-1", musicVolume: 25 }, ack);
    expect(io.to).toHaveBeenCalledWith("audio-room:ROOM-1");
    expect(emit).toHaveBeenCalledWith("audio-room:mix-changed", expect.objectContaining({ success: true }));
    expect(ack).toHaveBeenCalledOnce();
    emit.mockClear();
    await handlers["audio-room:mix-set"]({ roomId: "ROOM-1", musicVolume: 100 }, ack);
    expect(emit).not.toHaveBeenCalled();
  });
});
