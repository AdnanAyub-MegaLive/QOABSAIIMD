import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), db: { user: { count: vi.fn(), findMany: vi.fn() }, agency: { findMany: vi.fn() }, $transaction: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: m.db }));
vi.mock("@/lib/portal-admin", () => ({ requirePermission: m.permission }));
import { GET } from "../app/api/admin/management-members/route.js";
beforeEach(() => {
  vi.clearAllMocks();
  m.permission.mockResolvedValue({ role: "SUPER_ADMIN" });
  m.db.$transaction.mockImplementation(fn => fn(m.db));
  m.db.user.count.mockResolvedValue(1);
  m.db.user.findMany.mockResolvedValue([{ id: "internal", publicId: "USR-1", name: "Member" }]);
  m.db.agency.findMany.mockResolvedValue([{ bdUserId: "internal", publicId: "AGN-1", name: "Agency" }]);
});
it("requires platform admin, not just hierarchy permission", async () => {
  m.permission.mockResolvedValue({ role: "ADMIN" });
  expect((await GET(new Request("https://portal.test/api?"))).status).toBe(403);
  expect(m.db.$transaction).not.toHaveBeenCalled();
});
it("preserves unauthenticated errors", async () => {
  m.permission.mockRejectedValue(Object.assign(Error("Sign in"), { status: 401 }));
  expect((await GET(new Request("https://portal.test/api"))).status).toBe(401);
});
it("filters active members, paginates, and selects no credentials", async () => {
  const response = await GET(new Request("https://portal.test/api?role=BD&q=Ali&page=2"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const query = m.db.user.findMany.mock.calls[0][0];
  expect(query.where).toMatchObject({ deletedAt: null, status: "ACTIVE" });
  expect(query.skip).toBe(25);
  expect(query.select.passwordHash).toBeUndefined();
  const body = await response.json();
  expect(body.data.members[0].id).toBeUndefined();
  expect(body.data.members[0].supervisedAgencies).toEqual([{ publicId: "AGN-1", name: "Agency" }]);
});
it("combines country with role and search, including the total count", async () => {
  const response = await GET(new Request("https://portal.test/api?country=pk&role=BD&q=Ali"));
  expect(response.status).toBe(200);
  const where = m.db.user.findMany.mock.calls[0][0].where;
  expect(where.country).toEqual({ equals: "PK", mode: "insensitive" });
  expect(where.AND).toHaveLength(2);
  expect(m.db.user.count).toHaveBeenCalledWith({ where });
});
it("leaves countries unrestricted when no country is selected", async () => {
  await GET(new Request("https://portal.test/api"));
  expect(m.db.user.findMany.mock.calls[0][0].where.country).toBeUndefined();
});
it.each(["page=-1", "page=NaN", "role=INVALID", "country=ZZ", "country=invalid"])("rejects invalid filters %s", async params => {
  expect((await GET(new Request(`https://portal.test/api?${params}`))).status).toBe(422);
  expect(m.db.$transaction).not.toHaveBeenCalled();
});
