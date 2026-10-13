import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), transaction: vi.fn(), policy: { findUnique: vi.fn(), upsert: vi.fn() }, audit: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./portal-admin", () => ({ requirePermission: mocks.permission }));
import { PUT, GET } from "../app/api/admin/agencies/work/route.js";
const month = new Date().toISOString().slice(0, 7);
const body = { month, version: 0, tiers: [{ minDiamonds: "1000000", commissionBps: 200 }] };
const request = data => new Request("http://localhost/api/admin/agencies/work", { method: "PUT", body: JSON.stringify(data) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue({ id: "admin" });
  mocks.policy.findUnique.mockResolvedValue(null);
  mocks.transaction.mockImplementation(fn => fn({ agencySalaryPolicy: mocks.policy, auditLog: { create: mocks.audit } }));
});
it("requires agency management permission before changing commission policy", async () => {
  mocks.permission.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
  expect((await PUT(request(body))).status).toBe(403);
  expect(mocks.permission).toHaveBeenCalledWith("agencies.manage");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("requires agency viewing permission for aggregate financial reports", async () => {
  mocks.permission.mockRejectedValue(Object.assign(new Error("Sign in"), { status: 401 }));
  expect((await GET(new Request("http://localhost/api/admin/agencies/work"))).status).toBe(401);
  expect(mocks.permission).toHaveBeenCalledWith("agencies.view");
});
it("saves validated monthly targets with an audit entry and fixed conversion", async () => {
  expect((await PUT(request(body))).status).toBe(200);
  expect(mocks.policy.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { month, tiers: body.tiers, diamondsPerUsd: 90000n } }));
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ adminId: "admin", action: "AGENCY_SALARY_TARGETS_UPDATED" }) }));
});
it("rejects stale edits without changing salary calculations", async () => {
  mocks.policy.findUnique.mockResolvedValue({ version: 2 });
  expect((await PUT(request(body))).status).toBe(409);
  expect(mocks.policy.upsert).not.toHaveBeenCalled();
});
it("locks historical periods and rejects invalid percentages", async () => {
  expect((await PUT(request({ ...body, month: "2000-01" }))).status).toBe(422);
  expect((await PUT(request({ ...body, tiers: [{ minDiamonds: "1", commissionBps: 10001 }] }))).status).toBe(422);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
