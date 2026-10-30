import { expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), report: vi.fn(), tx: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: { $transaction: m.tx } }));
vi.mock("./mobile-api.js", () => ({ requireMobileUser: m.auth, mobileJson: (body,status=200) => Response.json(body,{status}), mobileApiError: e => Response.json({error:{code:e.message}},{status:401}) }));
vi.mock("./host-center.js", () => ({ hostCenter: m.report }));
vi.mock("./mobile-v1.js", () => ({ v1Options: () => new Response(null,{status:204}), withV1Request: (_r,_c,fn) => fn() }));
import { GET } from "../app/api/v1/me/host-center/route.js";
it("uses only authenticated identity and a repeatable read snapshot", async () => {
  m.auth.mockResolvedValue({ id: "authenticated" });
  m.tx.mockImplementation(fn => fn("db"));
  m.report.mockResolvedValue({ hostPublicId: "TLN-1" });
  const response = await GET(new Request("https://portal.test/api/v1/me/host-center?month=2026-10&userId=victim"));
  expect(response.status).toBe(200);
  expect(m.auth).toHaveBeenCalledWith(expect.any(Request),{syncVip:false});
  expect(m.report).toHaveBeenCalledWith("db","authenticated","2026-10");
  expect(m.tx).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:"RepeatableRead"});
});
it("rejects unauthenticated requests before querying the report", async () => {
  m.report.mockClear(); m.auth.mockRejectedValue(new Error("INVALID_SESSION"));
  expect((await GET(new Request("https://portal.test/api/v1/me/host-center"))).status).toBe(401);
  expect(m.report).not.toHaveBeenCalled();
});
it("returns a clear 422 and the earliest supported month",async()=>{
 m.auth.mockResolvedValue({id:"authenticated"});m.tx.mockImplementation(fn=>fn("db"));
 m.report.mockRejectedValue(Object.assign(new Error("Host Center is available from 2026-10."),{code:"HOST_MONTH_BEFORE_START",details:{hostSince:"2026-10-01T00:00:00.000Z",earliestMonth:"2026-10"}}));
 const response=await GET(new Request("https://portal.test/api/v1/me/host-center?month=2026-09"));
 expect(response.status).toBe(422);expect((await response.json()).error).toMatchObject({code:"HOST_MONTH_BEFORE_START",details:{earliestMonth:"2026-10"}});
});
