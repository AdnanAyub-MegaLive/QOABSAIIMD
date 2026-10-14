import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), audit: vi.fn(), permission: vi.fn(), emit: vi.fn() }));
vi.mock("@/lib/prisma", () => { const tx = { audioRoom: { findUnique: m.find, update: m.update }, auditLog: { create: m.audit } }; return { prisma: { ...tx, $transaction: fn => fn(tx) } }; });
vi.mock("@/lib/mobile-api", async original => ({ ...await original(), requireMobileUser: async () => ({ id: "actor", publicId: "USR-A" }) }));
vi.mock("@/lib/audio-room-management", () => ({ requireRoomPermission: m.permission }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.example" }));
vi.mock("@/lib/realtime", () => ({ emitToAudioRoom: m.emit }));
import { POST } from "../app/api/audio-rooms/cover/route.js";
function request(roomId) {
  const body = new FormData();
  body.set("image", new File([new Uint8Array([255,216,255,0])], "cover.jpg", { type: "image/jpeg" }));
  if (roomId) body.set("roomId", roomId);
  return new Request("https://portal.example/api/audio-rooms/cover", { method: "POST", body });
}
beforeEach(() => { vi.clearAllMocks(); m.find.mockResolvedValue({ id: "internal", roomId: "ROOM-1", ownerId: "owner" }); m.permission.mockResolvedValue({}); m.update.mockResolvedValue({roomId:"ROOM-1",coverImageUrl:"/api/audio-rooms/ROOM-1/cover",coverRevision:2,revision:10}); });
it("targets an explicit room and returns the same version in ack and room event", async () => {
  const result = await (await POST(request("ROOM-1"))).json();
  expect(m.find).toHaveBeenCalledWith(expect.objectContaining({where:{roomId:"ROOM-1"}}));
  expect(m.permission).toHaveBeenCalledWith(expect.objectContaining({ownerId:"owner"}),"actor","canManagePrivacy",expect.anything());
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({coverRevision:{increment:1}})}));
  expect(result.data.coverImageUrl).toContain("?v=2");
  expect(m.emit).toHaveBeenCalledWith("ROOM-1","audio-room:updated",result);
});
it("preserves owner-room targeting when roomId is omitted", async () => {
  await POST(request());
  expect(m.find).toHaveBeenCalledWith(expect.objectContaining({where:{ownerId:"actor"}}));
});
it("does not write or broadcast when authorization fails", async () => {
  m.permission.mockRejectedValue(Object.assign(new Error("ROOM_PERMISSION_DENIED"),{code:"ROOM_PERMISSION_DENIED"}));
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  const response=await POST(request("ROOM-1"));
  expect(response.status).toBe(403);expect(m.update).not.toHaveBeenCalled();expect(m.emit).not.toHaveBeenCalled();log.mockRestore();
});
