import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({db:{},emit:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:m.db}));
vi.mock("@/lib/realtime",()=>({emitToUser:m.emit}));
vi.mock("@/lib/host-public-id",async()=>import("./host-public-id.js"));
vi.mock("@/lib/user-roles",async()=>import("./user-roles.js"));
vi.mock("@/lib/mobile-api",()=>({requireMobileUser:async()=>({id:"owner",publicId:"USR-OWNER"}),mobileOptions:()=>{},mobileJson:(body,status=200)=>Response.json(body,{status}),mobileApiError:()=>Response.json({success:false},{status:500})}));
import { DELETE } from "../app/api/agencies/hosts/[hostId]/route.js";
beforeEach(()=>{
  vi.clearAllMocks();
  Object.assign(m.db,{
    user:{findFirst:vi.fn(async()=>({id:"host",publicId:"TLN-001234",agencyId:"agency",appRoles:["HOST","SENDER"],role:"HOST",agency:{publicId:"AGN-1",ownerUserId:"owner"}})),findUnique:vi.fn(async()=>null),updateMany:vi.fn(async()=>({count:1}))},
    legacyIdMapping:{updateMany:vi.fn()},agencyJoinRequest:{updateMany:vi.fn()},auditLog:{create:vi.fn()},
    $transaction:async(fn)=>fn(m.db),
  });
});
const remove=()=>DELETE(new Request("https://portal.test/api/agencies/hosts/TLN-001234",{method:"DELETE"}),{params:Promise.resolve({hostId:"TLN-001234"})});
it("removes agency and HOST together, restores USR and invalidates sessions",async()=>{
  const response=await remove();expect(response.status).toBe(200);
  expect(m.db.user.updateMany.mock.calls[0][0].data).toMatchObject({publicId:"USR-001234",agencyId:null,role:"SENDER",appRoles:{set:["SENDER"]},sessionVersion:{increment:1}});
  expect(m.db.user.updateMany.mock.calls[0][0].data).not.toHaveProperty("hostSalaryCoinBalance");
  expect(m.db.legacyIdMapping.updateMany).toHaveBeenCalled();
  expect((await response.json()).data).toMatchObject({previousPublicId:"TLN-001234",publicId:"USR-001234",sessionInvalidated:true});
  expect(m.emit).toHaveBeenCalledWith("TLN-001234","agency:host-removed",expect.any(Object));
});
it("rejects a conflicting restored ID without modifying membership",async()=>{
  m.db.user.findUnique.mockResolvedValue({id:"someone-else"});
  expect((await remove()).status).toBe(409);
  expect(m.db.user.updateMany).not.toHaveBeenCalled();
});
it("does not allow another agency owner to remove the host",async()=>{
  m.db.user.findFirst.mockResolvedValue({agencyId:"agency",agency:{ownerUserId:"another"}});
  expect((await remove()).status).toBe(403);
  expect(m.db.user.updateMany).not.toHaveBeenCalled();
});
