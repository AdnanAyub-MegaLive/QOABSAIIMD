import { beforeEach, it, expect, vi } from "vitest";
const { db, permission } = vi.hoisted(() => ({ db: { post: { findMany: vi.fn(), findUnique: vi.fn() } }, permission: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/portal-admin", () => ({ requirePermission: permission }));
vi.mock("@/lib/mobile-api", () => ({ requireMobileUser: async () => ({ id: "viewer" }), mobileOptions: () => {}, mobileJson: Response.json, mobileApiError: () => Response.json({}, { status: 400 }) }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test", resolveUserPerks: async () => new Map() }));
import { GET as feed } from "../app/api/posts/route.js";
import { GET as image } from "../app/api/posts/[postId]/image/route.js";
import { GET as queue, PATCH as review } from "../app/api/admin/posts/route.js";
beforeEach(() => { vi.clearAllMocks(); db.post.findMany.mockResolvedValue([]); db.post.findUnique.mockResolvedValue(null); permission.mockResolvedValue({ id: "a" }); });
it("public feed requires approval", async () => {
  await feed(new Request("https://portal.test/api/posts"));
  expect(db.post.findMany.mock.calls[0][0].where).toEqual({ status: "APPROVED" });
});
it("public image URL cannot expose an unapproved post", async () => {
  expect((await image(new Request("https://portal.test/api/posts/PST-1/image"), { params: Promise.resolve({ postId: "PST-1" }) })).status).toBe(404);
  expect(db.post.findUnique.mock.calls[0][0].where).toMatchObject({ status: "APPROVED" });
});
it("denies unauthenticated admin queue and image access", async () => {
  permission.mockRejectedValue(Object.assign(new Error("Sign in"), { status: 401, code: "UNAUTHORIZED" }));
  for (const suffix of ["", "?image=PST-1"]) expect((await queue(new Request(`https://portal.test/api/admin/posts${suffix}`))).status).toBe(401);
  expect(db.post.findMany).not.toHaveBeenCalled(); expect(db.post.findUnique).not.toHaveBeenCalled();
});
it("requires content.manage before accepting a review", async () => {
  permission.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403, code: "FORBIDDEN" }));
  expect((await review(new Request("https://portal.test/api/admin/posts", { method: "PATCH", body: "{}" }))).status).toBe(403);
  expect(permission).toHaveBeenCalledWith("content.manage");
});
