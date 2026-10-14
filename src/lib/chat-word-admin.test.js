import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(), sameOrigin: vi.fn(),
  policy: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  audit: { create: vi.fn() }, transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { chatWordPolicy: mocks.policy, $transaction: mocks.transaction } }));
vi.mock("@/lib/portal-admin", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/game-control/http", () => ({ sameOrigin: mocks.sameOrigin, jsonBody: request => request.json() }));
import { GET, PUT } from "../app/api/admin/prohibited-words/route.js";
const request = body => new Request("https://portal.example/api/admin/prohibited-words", { method: "PUT", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePermission.mockResolvedValue({ id: "admin" });
  mocks.policy.findUnique.mockResolvedValue(null);
  mocks.policy.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(fn => fn({ chatWordPolicy: mocks.policy, auditLog: mocks.audit }));
});
it("requires authentication before reading the list", async () => {
  mocks.requirePermission.mockRejectedValue(Object.assign(new Error("Sign in"), { status: 401, code: "UNAUTHORIZED" }));
  expect((await GET()).status).toBe(401);
  expect(mocks.policy.findUnique).not.toHaveBeenCalled();
});
it("requires management permission before changing the list", async () => {
  mocks.requirePermission.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403, code: "FORBIDDEN" }));
  expect((await PUT(request({ words: [], revision: 0 }))).status).toBe(403);
  expect(mocks.requirePermission).toHaveBeenCalledWith("rules.manage");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rejects untrusted origins", async () => {
  mocks.sameOrigin.mockImplementation(() => { throw Object.assign(new Error("Origin rejected"), { status: 403 }); });
  expect((await PUT(request({ words: [], revision: 0 }))).status).toBe(403);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("returns the empty initial list", async () => {
  expect(await (await GET()).json()).toMatchObject({ success: true, data: { words: [], revision: 0 } });
});
it("saves normalized words and an audit entry together", async () => {
  const result = await PUT(request({ words: [" TEST ", "test"], revision: 0 }));
  expect(await result.json()).toMatchObject({ success: true, data: { words: ["test"], revision: 1 } });
  expect(mocks.audit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ adminId: "admin", action: "CHAT_WORD_POLICY_UPDATED" }) }));
});
it("rejects stale revisions without auditing success", async () => {
  mocks.policy.updateMany.mockResolvedValue({ count: 0 });
  const response = await PUT(request({ words: ["test"], revision: 0 }));
  expect(response.status).toBe(409);
  expect(mocks.audit.create).not.toHaveBeenCalled();
});
