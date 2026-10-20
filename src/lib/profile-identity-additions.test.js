import {expect,it,vi} from "vitest";
vi.mock("./prisma.js",()=>({prisma:{}}));
import {activeSpecialIds} from "./special-id.js";
import {profileAgency} from "./profile-agency.js";
it("loads special IDs in one active unexpired started assignment query",async()=>{
  const db={specialIdAssignment:{findMany:vi.fn(async()=>[{userId:"a",specialId:"12345"}])}};
  expect((await activeSpecialIds(["a","b"],db)).get("a")).toBe("12345");
  const where=db.specialIdAssignment.findMany.mock.calls[0][0].where;
  expect(where).toMatchObject({status:"ACTIVE",revokedAt:null,startsAt:{lte:expect.any(Date)},expiresAt:{gt:expect.any(Date)}});
});
it("prefers active membership, otherwise uses a deterministic active owned agency without modifying roles",async()=>{
  const db={agency:{findFirst:vi.fn(async()=>({id:"owned",ownerUserId:"u",status:"ACTIVE"}))},user:{findUnique:async()=>({publicId:"USR-owner"})}};
  expect(await profileAgency(db,"u",null)).toMatchObject({id:"owned",isOwner:true,ownerPublicId:"USR-owner"});
  db.agency.findFirst.mockClear();
  expect(await profileAgency(db,"u",{id:"member",status:"ACTIVE",ownerUserId:"other"})).toMatchObject({id:"member",isOwner:false});
  expect(db.agency.findFirst).not.toHaveBeenCalled();
});
