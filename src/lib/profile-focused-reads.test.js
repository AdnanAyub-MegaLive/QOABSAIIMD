import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),covers:vi.fn(),agency:vi.fn(),assets:vi.fn(),user:vi.fn()}));
vi.mock("./prisma",()=>({prisma:{user:{findUnique:m.user}}}));
vi.mock("./mobile-api",()=>({requireMobileUser:m.auth,mobileJson:b=>Response.json(b),mobileCorsHeaders:{"Cache-Control":"no-store"},mobileApiError:()=>Response.json({},{status:401})}));
vi.mock("./avatar-upload",()=>({readAvatarFile:vi.fn()}));
vi.mock("./profile-cover",()=>({profileCoverDto:m.covers,decodeProfileCover:vi.fn(),COVER_GIF_MAX_BYTES:1}));
vi.mock("./avatar-history",()=>({avatarDisplayUrl:x=>x}));
vi.mock("./user-perks",()=>({requestOrigin:()=>"https://portal.test"}));
vi.mock("./rate-limit",()=>({isRateLimited:()=>false}));
vi.mock("./profile-agency",()=>({profileAgency:m.agency}));
vi.mock("./public-profile",()=>({displayAssets:m.assets}));
import {GET as media} from "../app/api/v1/users/me/covers/route.js";
import {GET as agency} from "../app/api/v1/users/me/agency/route.js";
beforeEach(()=>{
  vi.resetAllMocks();vi.spyOn(console,"error").mockImplementation(()=>{});
  m.auth.mockResolvedValue({id:"u",publicId:"USR-1",profileImage:"https://portal.test/avatar"});
  m.covers.mockResolvedValue({covers:[{id:"cover"}]});m.user.mockResolvedValue({agency:null});
  m.agency.mockResolvedValue({publicId:"AGN-1",name:"Agency",status:"ACTIVE",isOwner:true});m.assets.mockResolvedValue(new Map());
});
it("recovers media without reading agency or full profile",async()=>{
  m.agency.mockRejectedValue(new Error("broken agency"));
  const response=await media(new Request("https://portal.test/api/v1/users/me/covers"));
  expect(response.status).toBe(200);expect((await response.json()).data.covers).toHaveLength(1);
  expect(m.agency).not.toHaveBeenCalled();expect(m.covers).toHaveBeenCalledWith(expect.anything(),"u","u","https://portal.test");
});
it("loads membership without reading covers and preserves it if logo fails",async()=>{
  m.covers.mockRejectedValue(new Error("broken covers"));m.assets.mockRejectedValue(new Error("broken logo"));
  const response=await agency(new Request("https://portal.test/api/v1/users/me/agency"));
  expect(response.status).toBe(200);expect((await response.json()).data.agency.publicId).toBe("AGN-1");expect(m.covers).not.toHaveBeenCalled();
});
it.each([media,agency])("requires authenticated own-user access",async get=>{
  m.auth.mockRejectedValue(new Error("expired"));expect((await get(new Request("https://portal.test"))).status).toBe(401);
  expect(m.covers).not.toHaveBeenCalled();expect(m.agency).not.toHaveBeenCalled();
});
