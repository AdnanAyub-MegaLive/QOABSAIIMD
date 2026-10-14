import { expect, it, vi } from "vitest";
import { assertRoomModerationTarget, assertRoomModeratorPresent, guardRoomSocketAction, guardedRoomEvents } from "./room-moderation-guard.js";
const room={id:"r",roomId:"ROOM-1",ownerId:"owner"};
function database(){return {audioRoom:{findUnique:async()=>room},audioRoomRole:{findUnique:async({where})=>["admin","peer"].includes(where.audioRoomId_userId.userId)?{role:"ADMIN"}:null},audioRoomMember:{findUnique:async()=>({socketCount:0})},user:{findUnique:async()=>({id:"peer"})},audioRoomSeat:{findUnique:async()=>({occupantUserId:"peer"}),findMany:async()=>[{occupantUserId:"peer"}]}}}
it("only the owner may moderate delegated admins or the owner",async()=>{
 const db=database();for(const target of ["owner","peer"])await expect(assertRoomModerationTarget(db,room,"admin",target)).rejects.toMatchObject({code:"ROOM_PERMISSION_DENIED"});
 await expect(assertRoomModerationTarget(db,room,"owner","peer")).resolves.toBeUndefined();
 await expect(assertRoomModerationTarget(db,room,"admin","listener")).resolves.toBeUndefined();
});
it("REST permits the owner remotely but requires moderator presence",async()=>{
 await expect(assertRoomModeratorPresent(database(),room,"admin")).rejects.toMatchObject({code:"JOIN_ROOM_FIRST"});
 await expect(assertRoomModeratorPresent(database(),room,"owner")).resolves.toBeUndefined();
});
it.each([...guardedRoomEvents])("requires a joined socket for %s",async event=>{
 await expect(guardRoomSocketAction(database(),{rooms:new Set()},"admin",event,{roomId:"ROOM-1"})).rejects.toMatchObject({code:"JOIN_ROOM_FIRST"});
});
it.each(["seat-kick","seat-force-mute","member-force-deafen","seat-move-member","seats-bulk"])("protects peers through %s",async event=>{
 await expect(guardRoomSocketAction(database(),{rooms:new Set(["audio-room:ROOM-1"])},"admin",`audio-room:${event}`,{roomId:"ROOM-1",userId:"USR-2",action:"CLEAR_ALL"})).rejects.toMatchObject({code:"ROOM_PERMISSION_DENIED"});
});
it("does not query unrelated socket activity",async()=>{const db={audioRoom:{findUnique:vi.fn()}};await guardRoomSocketAction(db,{},"u","audio-room:message",{});expect(db.audioRoom.findUnique).not.toHaveBeenCalled()});
