import { afterEach, expect, it, vi } from "vitest";
vi.mock("./prisma", () => ({ prisma: { apiRequestLog: { create: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "X-Request-Id": "mobile-direct-123" }) }));
import { mobileJson, mobileApiError, giftJson } from "./mobile-api.js";
import { withV1Request } from "./mobile-v1.js";

const safe = { success: false, error: { code: "SERVER_PROBLEM", message: "Server problem. Please try again later." } };
afterEach(() => vi.restoreAllMocks());
it.each([
  () => mobileApiError(Object.assign(new Error("Private payout storage is not configured."), { code:"PAYOUT_CONFIGURATION_INCOMPLETE",status:403 })),
  () => mobileJson({success:false,error:{code:"VOICE_STORAGE_UNAVAILABLE",message:"private bucket"},debug:"private details"},409),
  () => giftJson({success:false,error:{code:"DB_FAILED",message:"database offline"}},503),
  () => mobileJson({success:false,error:{code:"TRANSFER_DISABLED",message:"Configuration is incomplete. Contact support."}},403),
  () => mobileApiError(new Error("unexpected database failure")),
])("redacts mobile errors and correlates diagnostics with the response",async send=>{
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  const response=await send();
  expect(await response.json()).toEqual(safe);
  expect(response.headers.get("x-request-id")).toBe("mobile-direct-123");
  expect(log).toHaveBeenCalledWith("Mobile API server problem",expect.objectContaining({requestId:"mobile-direct-123",message:expect.any(String)}));
});
it("preserves business validation details",async()=>{
  const body={success:false,error:{code:"VALIDATION_ERROR",message:"Choose a country.",fields:{country:"required"}}};
  expect(await (await mobileJson(body,422)).json()).toEqual(body);
});
it.each([false,true])("protects delegated v1 errors with the wrapper request ID (legacy=%s)",async legacy=>{
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  const request=new Request("https://example.test/api/v1/test",{headers:{"x-request-id":"wrapper-123"}});
  const body={success:false,error:{code:"PROVIDER_FAILED",message:"real provider problem"}};
  const response=await withV1Request(request,{path:"/api/v1/test"},()=>legacy?Response.json(body,{status:409}):mobileJson(body,409));
  expect(await response.json()).toEqual(safe);
  expect(response.status).toBe(409);
  expect(response.headers.get("x-request-id")).toBe("wrapper-123");
  expect(log).toHaveBeenCalledWith("Mobile API server problem",{requestId:"wrapper-123",code:"PROVIDER_FAILED",message:"real provider problem",status:409});
});
