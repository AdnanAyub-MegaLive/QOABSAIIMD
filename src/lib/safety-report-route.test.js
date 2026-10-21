import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),rate:vi.fn(),submit:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{}}));
vi.mock("@/lib/mobile-api",()=>({requireMobileUser:m.auth,mobileJson:(body,status=200)=>Response.json(body,{status}),mobileOptions:()=>new Response(null,{status:204}),mobileApiError:()=>Response.json({success:false},{status:401})}));
vi.mock("@/lib/rate-limit",()=>({isRateLimited:m.rate}));
vi.mock("@/lib/safety-reports",()=>({submitSafetyReport:m.submit}));
import {POST} from "../app/api/reports/route.js";
it("uses the authenticated reporter and returns only the report identifier",async()=>{
 m.auth.mockResolvedValue({id:"authenticated"});m.rate.mockReturnValue(false);m.submit.mockResolvedValue({reportId:"RPT-1"});
 const response=await POST(new Request("https://portal.test/api/reports",{method:"POST",body:JSON.stringify({reporterUserId:"forged",targetType:"USER"})}));
 expect(response.status).toBe(201);expect(m.submit.mock.calls[0][1]).toBe("authenticated");
 expect(await response.json()).toEqual({success:true,data:{reportId:"RPT-1"}});
});
it("rate limits before creating a report",async()=>{
 m.submit.mockClear();m.auth.mockResolvedValue({id:"u"});m.rate.mockReturnValue(true);
 const response=await POST(new Request("https://portal.test/api/reports",{method:"POST",body:"{}"}));
 expect(response.status).toBe(429);expect((await response.json()).error.code).toBe("RATE_LIMITED");expect(m.submit).not.toHaveBeenCalled();
});
it("rejects invalid sessions before creating a report",async()=>{
 m.submit.mockClear();m.auth.mockRejectedValue(new Error("SESSION_REVOKED"));
 expect((await POST(new Request("https://portal.test/api/reports",{method:"POST",body:"{}"}))).status).toBe(401);expect(m.submit).not.toHaveBeenCalled();
});
