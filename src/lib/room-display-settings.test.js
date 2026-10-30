import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), auth: vi.fn(), permission: vi.fn(), emit: vi.fn(), seats: vi.fn() }));
vi.mock("@/lib/prisma", () => { const tx = { audioRoom: { findUnique: m.find, update: m.update } }; return { prisma: { ...tx, $transaction: fn => fn(tx) } }; });
vi.mock("@/lib/mobile-api", async original => ({ ...await original(), requireMobileUser: m.auth }));
vi.mock("@/lib/audio-room-management", () => ({ requireRoomPermission: m.permission }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.example" }));
vi.mock("@/lib/realtime", () => ({ emitToAudioRoom: m.emit }));
vi.mock("@/lib/audio-room-seats", () => ({ ensureAudioRoomSeats: m.seats, reconcileAudioRoomLayoutSeats: m.seats, normalizeAudioRoomSeatLayout: m.seats, readAudioRoomSeatState: m.seats }));
import { PATCH } from "../app/api/v1/audio-rooms/[roomId]/route.js";
let room;
const patch = body => PATCH(new Request("https://portal.example/api/v1/audio-rooms/ROOM-1", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ roomId: "ROOM-1" }) });
beforeEach(() => {
  vi.clearAllMocks();
  room = { id: "internal", roomId: "ROOM-1", ownerId: "owner", title: "Original room", privacyMode: "PUBLIC", paidEntryCoins: null, announcement: "Keep me", showHeaderAndTrophy: true, settingsRevision: 0, revision: 42, seatLayout: [3], updatedAt: new Date() };
  m.auth.mockResolvedValue({ id: "owner" }); m.find.mockImplementation(async () => room); m.permission.mockResolvedValue({});
  m.update.mockImplementation(async ({ data }) => { for (const [key, value] of Object.entries(data)) room[key] = value?.increment ? room[key] + value.increment : value; return { ...room }; });
});
it("persists both booleans, preserves unrelated settings and broadcasts confirmed revisions", async () => {
  for (const [visible, revision] of [[false,1],[true,2]]) {
    const response = await patch({ showHeaderAndTrophy: visible });
    expect(response.status).toBe(200);
    expect((await response.json()).data.room).toMatchObject({ showHeaderAndTrophy: visible, settingsRevision: revision, title: "Original room", announcement: "Keep me", privacyMode: "PUBLIC", seatLayout: [3] });
    expect(m.emit).toHaveBeenCalledWith("ROOM-1", "audio-room:settings-changed", { success: true, data: { roomId: "ROOM-1", showHeaderAndTrophy: visible, settingsRevision: revision, revision: 42+revision } });
  }
  expect(m.update.mock.calls[0][0].where).toEqual({ id: "internal", ownerId: "owner" });
  expect(m.seats).not.toHaveBeenCalled();
});
it.each(["admin", "member", "staff"])("rejects %s even when delegated permissions allow privacy editing", async id => {
  m.auth.mockResolvedValue({ id });
  const response = await patch({ showHeaderAndTrophy: false, title: "Must not apply" });
  expect(response.status).toBe(403); expect((await response.json()).error.code).toBe("ROOM_OWNER_REQUIRED");
  expect(m.update).not.toHaveBeenCalled(); expect(m.emit).not.toHaveBeenCalled();
});
it.each([null, "false", "true", 0, 1, [], {}].map(value => [value]))("rejects invalid visibility %j without writing", async value => {
  expect((await patch({ showHeaderAndTrophy: value })).status).toBe(422);
  expect(m.update).not.toHaveBeenCalled(); expect(m.emit).not.toHaveBeenCalled();
});
it("does not reset visibility or advance its revision when editing other settings", async () => {
  room.showHeaderAndTrophy=false; room.settingsRevision=7;
  const result=await (await patch({ title: "New title" })).json();
  expect(result.data.room).toMatchObject({title:"New title",showHeaderAndTrophy:false,settingsRevision:7});
  expect(m.emit.mock.calls.map(call=>call[1])).toEqual(["audio-room:updated"]);
});
it("does not broadcast a rejected database save", async () => {
  m.update.mockRejectedValueOnce(Object.assign(new Error("ROOM_UNAVAILABLE"), { code:"ROOM_UNAVAILABLE" }));
  expect((await patch({ showHeaderAndTrophy:false })).status).not.toBe(200);
  expect(room.showHeaderAndTrophy).toBe(true); expect(m.emit).not.toHaveBeenCalled();
});
