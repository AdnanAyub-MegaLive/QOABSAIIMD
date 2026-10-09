import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({findMany:vi.fn(),auth:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{agency:{findMany:mocks.findMany}}}));
vi.mock("@/lib/geo-country",()=>({normalizeCountryCode:value=>String(value??"").trim().toUpperCase()==="PK"?"PK":null}));
vi.mock("@/lib/mobile-api",()=>({requireMobileUser:mocks.auth,mobileJson:(body,status=200)=>Response.json(body,{status}),mobileOptions:()=>new Response(null),mobileApiError:()=>Response.json({success:false},{status:401})}));
import { GET } from "../app/api/agencies/route.js";
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({id:"user"});mocks.findMany.mockResolvedValue([{publicId:"AGN-3165",name:"Star Agency",country:"PK",level:58,_count:{userHosts:12}}]);});
it.each(["3165","agn-3165","star"])("searches name and ID in database for %s",async q=>{
 const response=await GET(new Request(`https://portal.example/api/agencies?q=${q}`));
 expect(mocks.findMany.mock.calls[0][0]).toMatchObject({where:{status:"ACTIVE",OR:[{name:{contains:q,mode:"insensitive"}},{publicId:{contains:q,mode:"insensitive"}}]},take:100});
 expect((await response.json()).data.agencies[0]).toEqual({id:"AGN-3165",name:"Star Agency",country:"PK",level:58,hostCount:12});
});
it("returns empty search without breaking query-less country browsing",async()=>{
 expect((await (await GET(new Request("https://portal.example/api/agencies?q="))).json()).data.agencies).toEqual([]);
 expect(mocks.findMany).not.toHaveBeenCalled();
 await GET(new Request("https://portal.example/api/agencies?country=pk"));
 expect(mocks.findMany.mock.calls[0][0].where).toEqual({status:"ACTIVE",country:"PK"});
});
it("rejects invalid countries",async()=>{expect((await GET(new Request("https://portal.example/api/agencies?country=ZZ"))).status).toBe(422);expect(mocks.findMany).not.toHaveBeenCalled();});
it("requires authentication",async()=>{mocks.auth.mockRejectedValue(new Error("INVALID_SESSION"));expect((await GET(new Request("https://portal.example/api/agencies?q=3165"))).status).toBe(401);expect(mocks.findMany).not.toHaveBeenCalled();});
