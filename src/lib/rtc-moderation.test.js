import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({remove:vi.fn(),emit:vi.fn()}));
vi.mock("tencentcloud-sdk-nodejs-trtc",()=>({trtc:{v20190722:{Client:class { RemoveUserByStrRoomId(input){return mocks.remove(input);} }}}}));
import { removeRtcParticipant, updateRtcPublishPermission } from "./rtc-moderation.js";
beforeEach(()=>{
  vi.clearAllMocks(); vi.stubEnv("RTC_PROVIDER","TRTC"); vi.stubEnv("TRTC_SDK_APP_ID","20044231");
  vi.stubEnv("TENCENT_CLOUD_SECRET_ID","test"); vi.stubEnv("TENCENT_CLOUD_SECRET_KEY","test");
  mocks.remove.mockResolvedValue({RequestId:"test"}); globalThis.portalIo={to:()=>({emit:mocks.emit})};
});
afterEach(()=>{vi.unstubAllEnvs();delete globalThis.portalIo;});
it("removes the correct string-room member on downgrade",async()=>{
  await updateRtcPublishPermission("ROOM-1","USR-1",false);
  expect(mocks.remove).toHaveBeenCalledWith({SdkAppId:20044231,RoomId:"ROOM-1",UserIds:["USR-1"]});
  expect(mocks.emit).toHaveBeenCalledWith("rtc:credentials-invalidated",{success:true,data:{provider:"TRTC",roomId:"ROOM-1",reconnect:true}});
});
it("requests fresh permissions on promotion without removing the user",async()=>{
  await updateRtcPublishPermission("ROOM-1","USR-1",true);
  expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.emit).toHaveBeenCalled();
});
it("does not silently succeed when cloud credentials are missing",async()=>{
  vi.stubEnv("TENCENT_CLOUD_SECRET_ID","");
  await expect(removeRtcParticipant("ROOM-1","USR-1")).rejects.toThrow("TRTC_CLOUD_NOT_CONFIGURED");
});
