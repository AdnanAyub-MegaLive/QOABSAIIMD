import { beforeEach, it, expect, vi } from "vitest";
const { db, authenticate } = vi.hoisted(() => ({ db: { post: { findFirst: vi.fn() }, userBlock: { findFirst: vi.fn() } }, authenticate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/mobile-api", () => ({ requireMobileUser: authenticate, mobileOptions: () => {}, mobileJson: (body, status = 200) => Response.json(body, { status }), mobileApiError: () => Response.json({}, { status: 401 }) }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test", resolveUserPerks: async () => new Map() }));
import { GET } from "../app/api/posts/[postId]/route.js";
const request = () => GET(new Request("https://portal.test/api/posts/PST-1"), { params: Promise.resolve({ postId: "PST-1" }) });
const post = { publicId: "PST-1", status: "APPROVED", imageUrl: "/image", description: "Hello", reviewReason: "private", createdAt: new Date(), _count: { likes: 1, comments: 0 }, likes: [], author: { id: "author", publicId: "USR-a", name: "Author" } };
beforeEach(() => { vi.clearAllMocks(); authenticate.mockResolvedValue({ id: "viewer" }); db.post.findFirst.mockResolvedValue(post); db.userBlock.findFirst.mockResolvedValue(null); });
it("loads a post directly with authorization and hides private review details", async () => {
  const response = await request();
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data).toMatchObject({ id: "PST-1", hasImage: true, reviewReason: null });
  expect(db.post.findFirst).toHaveBeenCalledTimes(1);
  expect(db.post.findFirst.mock.calls[0][0].where).toMatchObject({ publicId: "PST-1", OR: [{ status: "APPROVED" }, { authorId: "viewer" }], author: { status: "ACTIVE", deletedAt: null } });
});
it("does not disclose a blocked author's post", async () => {
  db.post.findFirst.mockResolvedValue(null);
  expect((await request()).status).toBe(404);
  expect(db.post.findFirst.mock.calls[0][0].where.author).toMatchObject({ blockedUsers: { none: { blockedId: "viewer" } }, blockedByUsers: { none: { blockerId: "viewer" } } });
});
it("returns an owner's review state without publishing their pending image", async () => {
  authenticate.mockResolvedValue({ id: "author" });
  db.post.findFirst.mockResolvedValue({ ...post, status: "REJECTED" });
  expect((await (await request()).json()).data).toMatchObject({ status: "REJECTED", imageUrl: null, hasImage: true, reviewReason: "private" });
});
it("requires authentication and handles missing posts", async () => {
  authenticate.mockRejectedValueOnce(new Error("Unauthorized"));
  expect((await request()).status).toBe(401);
  expect(db.post.findFirst).not.toHaveBeenCalled();
  db.post.findFirst.mockResolvedValue(null);
  expect((await request()).status).toBe(404);
});
