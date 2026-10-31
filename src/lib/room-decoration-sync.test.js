import { describe, expect, it, vi } from "vitest";
const { emit, perks } = vi.hoisted(() => ({ emit: vi.fn(async () => {}), perks: { frameUrl: "https://f", badgeUrl: null, chatBoxUrl: null, vipLevel: 0, vipPrivileges: [] } }));
vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./realtime.js", () => ({ emitToAudioRoom: emit }));
vi.mock("./user-perks.js", () => ({ resolveUserPerks: async () => new Map([["USR-1", perks]]) }));
import { syncRoomDecorations } from "./room-decoration-sync.js";

describe("syncRoomDecorations", () => {
  const user = { id: "u1", publicId: "USR-1", name: "Member", profileImage: "https://avatar" };
  it("rebroadcasts seats where the user sits and tells each live room", async () => {
    const broadcast = vi.fn(async () => {});
    globalThis.portalBroadcastAudioRoomSeats = broadcast;
    const db = { audioRoomRole: { findMany: vi.fn(async () => []) }, audioRoomMember: { findMany: vi.fn(async () => [
      { user, userId: user.id, joinedAt: new Date(), audioRoom: { id: "db1", roomId: "R1", seatLayout: [5, 5], seats: [{ id: "s1" }] } },
      { user, userId: user.id, joinedAt: new Date(), audioRoom: { id: "db2", roomId: "R2", seatLayout: [5, 5], seats: [] } },
    ]) } };
    await syncRoomDecorations(user, "FRAMES", "https://portal.test", db);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("R1", "audio-room:member-updated", expect.objectContaining({ success: true, data: { roomId: "R1", decorationsOnly: true, member: expect.objectContaining({ publicId: "USR-1", frameUrl: "https://f", name: "Member", profileImage: "https://avatar" }) } }));
    expect(emit).toHaveBeenCalledWith("R2", "audio-room:member-updated", expect.objectContaining({ data: expect.objectContaining({ roomId: "R2" }) }));
    delete globalThis.portalBroadcastAudioRoomSeats;
  });

  it("does not expose an invisible listener through a decoration event", async () => {
    emit.mockClear();
    perks.vipPrivileges = ["INVISIBLE_ENTRY"];
    const db = { audioRoomMember: { findMany: async () => [{ user, userId: user.id, joinedAt: new Date(), audioRoom: { id: "room", roomId: "R1", seats: [] } }] } };
    try { await syncRoomDecorations(user, "FRAMES", "https://portal.test", db); expect(emit).not.toHaveBeenCalled(); }
    finally { perks.vipPrivileges = []; }
  });
  it("ignores categories rooms never show", async () => {
    const db = { audioRoomMember: { findMany: vi.fn() } };
    await syncRoomDecorations(user, "PROFILE_BG", "", db);
    expect(db.audioRoomMember.findMany).not.toHaveBeenCalled();
  });
});
