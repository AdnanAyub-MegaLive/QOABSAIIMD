import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), ban: vi.fn(), issue: vi.fn(), sockets: vi.fn() }));
vi.mock("./prisma.js", () => ({prisma:{audioRoom:{findUnique:mocks.find}}}));
vi.mock("./audio-room-management.js", () => ({activeRoomBan:mocks.ban}));
vi.mock("./trtc-authorization.js", () => ({issueTrtcAccess:mocks.issue}));
vi.mock("./rtc-provider.js", () => ({rtcProvider:()=>"TRTC"}));
import { audioRtcAccess } from "./rtc-access.js";
const user={id:"internal-1",publicId:"USR-1"};
beforeEach(() => {
  vi.clearAllMocks(); mocks.ban.mockResolvedValue(null);
  mocks.find.mockResolvedValue({id:"room",ownerId:"owner",status:"LIVE",isBlocked:false,seats:[]});
  mocks.sockets.mockResolvedValue([{rooms:new Set(["audio-room:ROOM-1"])}]);
  globalThis.portalIo={in:()=>({fetchSockets:mocks.sockets})};
});
it("requires authenticated socket membership, not just knowing an ID", async()=>{
  mocks.sockets.mockResolvedValue([]);
  await expect(audioRtcAccess(user,"ROOM-1")).rejects.toThrow("RTC_ROOM_JOIN_REQUIRED");
  expect(mocks.issue).not.toHaveBeenCalled();
});
it("rejects banned members",async()=>{
  mocks.ban.mockResolvedValue({id:"ban"});
  await expect(audioRtcAccess(user,"ROOM-1")).rejects.toThrow("ROOM_BANNED");
});
it.each([[[],false],[[{isMuted:false,isForceMuted:false}],true],[[{isMuted:false,isForceMuted:true}],false],[[{isMuted:true,isForceMuted:false}],false]])("derives publishing from authoritative seats",async(seats,publish)=>{
  mocks.find.mockResolvedValue({id:"room",ownerId:"owner",status:"IDLE",seats});
  await audioRtcAccess(user,"ROOM-1"); expect(mocks.issue).toHaveBeenCalledWith(user,"ROOM-1",publish);
});
it("never interprets a missing internal user ID as an unfiltered query",async()=>{
  await expect(audioRtcAccess({publicId:"USR-1"},"ROOM-1")).rejects.toThrow("RTC_INVALID_IDENTITY");
  expect(mocks.find).not.toHaveBeenCalled();
});
it("honors a downgrade even if the seat removal is still committing",async()=>{
  mocks.find.mockResolvedValue({id:"room",ownerId:user.id,status:"LIVE",seats:[]});
  await audioRtcAccess(user,"ROOM-1",false); expect(mocks.issue).toHaveBeenCalledWith(user,"ROOM-1",false);
});
