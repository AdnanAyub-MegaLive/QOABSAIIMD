import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth:vi.fn(), access:vi.fn(), extras:vi.fn(), version:vi.fn(), tags:vi.fn(), perks:vi.fn(), db: {
  friendRequest:{count:vi.fn()}, userFollow:{count:vi.fn(),findUnique:vi.fn()}, userProfileLike:{count:vi.fn()}, userProfileVisit:{count:vi.fn()}, userAlbumItem:{findMany:vi.fn()}
} }));
vi.mock("./prisma",()=>({prisma:m.db}));
vi.mock("./mobile-api",()=>({requireMobileUser:m.auth,mobileCorsHeaders:{"Cache-Control":"no-store"},mobileOptions:()=>new Response(),mobileJson:(b,s=200)=>Response.json(b,{status:s}),mobileApiError:e=>Response.json({error:e.code},{status:e.status??500})}));
vi.mock("./public-profile",()=>({profileAccess:m.access,profileExtras:m.extras,recordProfileVisit:async()=>{},publicAge:()=>null,wallCursor:()=>null}));
vi.mock("./user-perks",()=>({requestOrigin:()=>"https://portal.test",resolveUserPerks:m.perks}));
vi.mock("./role-tags",()=>({resolveRoleTags:m.tags}));
vi.mock("./joinable-presence",()=>({joinableAudioPresence:async()=>null}));
vi.mock("./media-payload",()=>({versionMediaPayload:m.version}));
vi.mock("./avatar-history",()=>({avatarDisplayUrl:x=>x}));
vi.mock("./geo-country",()=>({normalizeSignupCountry:x=>x}));
vi.mock("./rate-limit",()=>({isRateLimited:()=>false}));
vi.mock("next/server",()=>({after:()=>{}}));
import { GET } from "../app/api/v1/users/[publicId]/profile/route.js";
const get=()=>GET(new Request("https://portal.test/api/v1/users/USR-B/profile"),{params:Promise.resolve({publicId:"USR-B"})});
beforeEach(()=>{
  vi.resetAllMocks();vi.spyOn(console,"error").mockImplementation(()=>{});
  m.auth.mockResolvedValue({id:"a"});m.access.mockResolvedValue({target:{id:"b",publicId:"USR-B",name:"Person",vipLevel:1,audioRooms:[]},isSelf:false,isFriend:false,friendRequest:{status:"NONE"}});
  m.extras.mockResolvedValue({roles:[],unavailableFields:["progression","covers"]});
  m.version.mockImplementation(async b=>b);m.tags.mockResolvedValue(new Map());m.perks.mockResolvedValue(new Map());
  for(const model of Object.values(m.db))for(const [key,fn]of Object.entries(model))fn.mockResolvedValue(key==="count"?2:key==="findMany"?[]:null);
});
it("returns base identity and VIP despite unavailable progression and covers",async()=>{
  const response=await get();expect(response.status).toBe(200);
  const {data}=await response.json();expect(data.user).toMatchObject({publicId:"USR-B",vipLevel:1,name:"Person",counters:{wealth:null}});
  expect(data.user.unavailableFields).toContain("covers");
});
it.each(["album","relationship","roleTags","mediaVersions"])("isolates %s failure",async field=>{
  const fail=()=>Promise.reject(new Error("private failure detail"));
  if(field==="album")m.db.userAlbumItem.findMany.mockImplementation(fail);
  if(field==="relationship")m.db.userFollow.findUnique.mockImplementation(fail);
  if(field==="roleTags")m.tags.mockImplementation(fail);
  if(field==="mediaVersions")m.version.mockImplementation(fail);
  const response=await get();expect(response.status).toBe(200);const body=await response.json();
  expect(body.data.user.name).toBe("Person");expect(body.data.user.unavailableFields).toContain(field);
  expect(JSON.stringify(body)).not.toContain("private failure detail");
});
it.each([403,404])("does not bypass denied profile access (%s)",async status=>{
  m.access.mockRejectedValue(Object.assign(new Error("restricted"),{status}));
  expect((await get()).status).toBe(status);expect(m.extras).not.toHaveBeenCalled();
});
it("does not bypass authentication",async()=>{
  m.auth.mockRejectedValue(Object.assign(new Error("expired"),{status:401}));
  expect((await get()).status).toBe(401);expect(m.access).not.toHaveBeenCalled();
});
