import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), apply: vi.fn(), rtc: vi.fn(), seats: vi.fn(), emit: vi.fn(), room: vi.fn(), count: vi.fn(), gifts: vi.fn(), transaction: vi.fn() }));
vi.mock("./portal-admin", () => ({ requirePermission: mocks.permission }));
vi.mock("./prisma", () => ({ prisma: { audioRoom: { findUnique: mocks.room }, giftTransaction: { count: mocks.count, findMany: mocks.gifts }, $transaction: mocks.transaction } }));
vi.mock("./portal-room-controls", () => ({ applyPortalRoomControl: mocks.apply }));
vi.mock("./rtc-moderation", () => ({ updateRtcPublishPermission: mocks.rtc }));
vi.mock("./audio-room-seats", () => ({ readAudioRoomSeatState: mocks.seats }));
vi.mock("./realtime", () => ({ emitToAudioRoom: mocks.emit, emitToUser: mocks.emit }));
vi.mock("./user-perks", () => ({ requestOrigin: () => "https://portal.test" }));
import { POST } from "../app/api/admin/room-management/controls/route";
import { GET } from "../app/api/admin/room-management/gifts/route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ id: "admin" });
  mocks.apply.mockResolvedValue({ room: { roomId: "ROOM-1", updatedAt: new Date() }, target: { publicId: "USR-2" }, action: "FORCE_MUTE" });
  vi.stubGlobal("portalIo", {}); vi.stubGlobal("portalRemoveFromAudioRoom", vi.fn()); vi.stubGlobal("portalSyncAudioRoomRemoval", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
const post = () => POST(new Request("https://portal.test/api/admin/room-management/controls", { method: "POST", body: JSON.stringify({ action: "FORCE_MUTE" }) }));
it("requires rooms.manage before any control mutation", async () => {
  mocks.permission.mockRejectedValue({ status: 403, code: "FORBIDDEN", message: "Denied" });
  expect((await post()).status).toBe(403); expect(mocks.permission).toHaveBeenCalledWith("rooms.manage"); expect(mocks.apply).not.toHaveBeenCalled();
});
it("refuses controls when realtime enforcement is unavailable", async () => {
  vi.stubGlobal("portalIo", null); expect((await post()).status).toBe(503); expect(mocks.apply).not.toHaveBeenCalled();
});
it("force mute revokes RTC publishing and emits seat state", async () => {
  expect((await post()).status).toBe(200);
  expect(mocks.rtc).toHaveBeenCalledWith("ROOM-1", "USR-2", false);
  expect(mocks.emit).toHaveBeenCalledWith("ROOM-1", "audio-room:seat-update", expect.anything());
});
it("reports post-commit RTC failure without pretending enforcement succeeded", async () => {
  mocks.rtc.mockRejectedValue(new Error("provider unavailable"));
  const response = await post(); expect(response.status).toBe(200);
  expect((await response.json()).data.warnings).toHaveLength(1);
});
it("gift history requires view permission", async () => {
  mocks.permission.mockRejectedValue({ status: 403, code: "FORBIDDEN" });
  expect((await GET(new Request("https://portal.test/?roomId=ROOM-1"))).status).toBe(403);
  expect(mocks.room).not.toHaveBeenCalled();
});
it("paginates room gifts, preserves exact coins and exposes reversals", async () => {
  mocks.room.mockResolvedValue({ id: "room" });
  mocks.transaction.mockResolvedValue([30, [{ id: "gift", coinValue: 9007199254740993n, reversedAt: new Date(), sender: { name: "Sender" }, talent: { publicId: "TLN-1", displayName: "Host" } }]]);
  const response = await GET(new Request("https://portal.test/?roomId=ROOM-1&page=2&q=rose"));
  expect(response.status).toBe(200);
  const data = (await response.json()).data;
  expect(data.items[0]).toMatchObject({ coinValue: "9007199254740993", recipient: { name: "Host" } });
  expect(data.items[0].reversedAt).toBeTruthy();
  expect(mocks.gifts).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25, where: expect.objectContaining({ roomId: "ROOM-1" }), orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
});
