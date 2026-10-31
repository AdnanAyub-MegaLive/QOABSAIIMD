import { beforeEach, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: { post: { findUnique: vi.fn(), update: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/mobile-api", () => ({
  requireMobileUser: async () => ({ id: "owner", publicId: "USR-owner" }),
  mobileOptions: () => {},
  mobileJson: (body, status = 200) => Response.json(body, { status }),
  mobileApiError: () => Response.json({}, { status: 500 }),
}));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test", resolveUserPerks: async () => new Map() }));
import { PATCH } from "../app/api/posts/[postId]/route.js";
let row;
beforeEach(() => {
  vi.clearAllMocks();
  row = { id: "post", publicId: "PST-1", authorId: "owner", description: "Text", imageUrl: "/image", reviewRevision: 0 };
  db.post.findUnique.mockImplementation(async () => ({ ...row }));
  db.$transaction.mockImplementation(async fn => fn(db));
  db.post.update.mockImplementation(async ({ where, data }) => {
    if (where.reviewRevision !== row.reviewRevision) throw Object.assign(new Error("Conflict"), { code: "P2025" });
    row = { ...row, ...data, reviewRevision: row.reviewRevision + 1, updatedAt: new Date() };
    return row;
  });
});
const edit = fields => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return PATCH({ formData: async () => form }, { params: Promise.resolve({ postId: "PST-1" }) });
};
it("rejects a stale concurrent edit before it can remove the remaining content", async () => {
  const responses = await Promise.all([edit({ description: "" }), edit({ removeImage: "true" })]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  expect(Boolean(row.description || row.imageUrl)).toBe(true);
  expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  const conflict = responses.find(r => r.status === 409);
  expect((await conflict.json()).error.code).toBe("POST_EDIT_CONFLICT");
});
it("rejects sequential removal of all remaining content", async () => {
  expect((await edit({ description: "" })).status).toBe(200);
  expect((await edit({ removeImage: "true" })).status).toBe(400);
  expect(row.imageUrl).toBe("/image");
});
