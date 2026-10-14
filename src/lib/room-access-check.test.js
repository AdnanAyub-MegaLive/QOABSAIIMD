import { expect, it } from "vitest";
import { roomAccessCheck } from "./room-access-check.js";
const now=new Date("2026-10-14T12:00:00Z"),room={id:"r",roomId:"ROOM-1",ownerId:"owner",status:"IDLE",startedAt:now};
const db={audioRoomBan:{findFirst:async()=>null},audioRoomAdmission:{findUnique:async()=>null}};
it("allows idle rooms and needs no write methods",async()=>{expect((await roomAccessCheck(db,room,"listener",now)).code).toBeNull()});
it("returns permanent or timed ban details only when banned",async()=>{
 for(const expiresAt of [null,new Date("2026-10-15T12:00:00Z")]){const data=await roomAccessCheck({...db,audioRoomBan:{findFirst:async()=>({reason:"test",expiresAt})}},room,"u",now);expect(data).toMatchObject({code:"ROOM_BANNED",ban:{reason:"test",expiresAt:expiresAt?.toISOString()??null}})}
 expect(await roomAccessCheck(db,room,"u",now)).not.toHaveProperty("ban");
});
it("returns paid admission details and respects owner bypass",async()=>{
 const paid={...room,privacyMode:"PAID",paidEntryCoins:100n};
 expect(await roomAccessCheck(db,paid,"u",now)).toMatchObject({code:"ROOM_PAYMENT_REQUIRED",payment:{coins:"100",admitted:false}});
 expect(await roomAccessCheck(db,paid,"owner",now)).toMatchObject({code:null,payment:{admitted:true}});
});
it("evaluates restriction expiry without mutation and never checks passwords",async()=>{
 expect((await roomAccessCheck(db,{...room,isBlocked:true,blockedUntil:new Date(0),status:"BLOCKED"},"u",now)).code).toBeNull();
 expect((await roomAccessCheck(db,{...room,passwordHash:"private"},"u",now)).code).toBe("ROOM_PASSWORD_REQUIRED");
 expect((await roomAccessCheck(db,{...room,joiningDisabled:true},"u",now)).code).toBe("ROOM_OWNER_ONLY");
});
