import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), list: vi.fn(), choose: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mobile-api", () => ({ requireMobileUser: m.user, mobileJson: (body, status=200) => Response.json(body,{status}), mobileApiError: () => Response.json({success:false},{status:500}) }));
vi.mock("@/lib/mobile-v1", () => ({ withV1Request: (_r,_o,fn) => fn(), v1Options: () => new Response(null) }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: () => false }));
vi.mock("@/lib/special-id-ownership", () => ({ listUserSpecialIds: m.list, selectUserSpecialId: m.choose }));
import { GET, POST } from "../app/api/v1/users/me/special-ids/route.js";
const request = body => new Request("https://portal.test/api/v1/users/me/special-ids", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({id:"u"}); });
it("lists the authenticated user's IDs with private no-store caching", async () => {
  const items=[{assignmentId:"a",specialId:"0099999",status:"ACTIVE"}]; m.list.mockResolvedValue(items);
  const response=await GET(new Request("https://portal.test/api/v1/users/me/special-ids"));
  expect(await response.json()).toEqual({success:true,data:{items}});
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.list).toHaveBeenCalledWith({},"u");
});
it("selects using the authenticated user, ignoring a supplied userId", async () => {
  m.choose.mockResolvedValue({assignmentId:"a",specialId:"0099999",status:"ACTIVE"});
  expect((await POST(request({action:"USE",assignmentId:"a",userId:"victim"}))).status).toBe(200);
  expect(m.choose).toHaveBeenCalledWith({},"u","a");
});
it("validates actions and preserves the expired business error", async () => {
  expect((await POST(request({action:"DELETE",assignmentId:"a"}))).status).toBe(422);
  expect(m.choose).not.toHaveBeenCalled();
  m.choose.mockRejectedValue(Object.assign(Error("This Special ID has expired."),{code:"SPECIAL_ID_EXPIRED",status:409}));
  const response=await POST(request({action:"USE",assignmentId:"a"}));
  expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("SPECIAL_ID_EXPIRED");
});
