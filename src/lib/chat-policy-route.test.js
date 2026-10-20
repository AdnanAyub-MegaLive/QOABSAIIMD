import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),find:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{chatWordPolicy:{findUnique:m.find}}}));
vi.mock("@/lib/mobile-api",()=>({requireMobileUser:m.auth,mobileOptions:()=>new Response(null),mobileJson:async body=>Response.json(body),mobileApiError:()=>Response.json({},{status:401})}));
import {GET} from "../app/api/v1/chat/prohibited-words/route.js";
it("returns the configured policy to an authenticated user without public caching",async()=>{
 m.auth.mockResolvedValue({id:"a"});m.find.mockResolvedValue({words:["word"],revision:12});
 const response=await GET(new Request("https://portal.test/api/v1/chat/prohibited-words"));
 expect(response.status).toBe(200);expect(await response.json()).toEqual({words:["word"],revision:12});
 expect(response.headers.get("Cache-Control")).toContain("private");
 m.find.mockClear();m.auth.mockRejectedValue(Error("INVALID_SESSION"));
 expect((await GET(new Request("https://portal.test/api/v1/chat/prohibited-words"))).status).toBe(401);
 expect(m.find).not.toHaveBeenCalled();
});
