import { beforeEach, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ permission: vi.fn(), origin: vi.fn(), db: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: state.db }));
vi.mock("@/lib/portal-admin", () => ({ requirePermission: state.permission }));
vi.mock("@/lib/game-control/http", () => ({ sameOrigin: state.origin, jsonBody: request => request.json() }));
import { GET, PUT } from "../app/api/admin/global-announcements/route.js";
import { announcementDefaults } from "./global-announcement-policy.js";
beforeEach(() => {
  vi.clearAllMocks();
  state.permission.mockResolvedValue({ id: "admin" });
  state.origin.mockImplementation(() => {});
  state.db.globalAnnouncementPolicy = { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
  state.db.auditLog = { create: vi.fn() };
  state.db.$transaction = vi.fn(fn => fn(state.db));
});
const request = body => new Request("https://portal.example/api/admin/global-announcements", { method: "PUT", body: JSON.stringify(body) });
it("GET requires rules.view and returns disabled defaults without writes", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect((await response.json()).data.revision).toBe(0);
  expect(state.permission).toHaveBeenCalledWith("rules.view");
  expect(state.db.$transaction).not.toHaveBeenCalled();
});
it("denies unauthorized setting edits", async () => {
  state.permission.mockRejectedValue(Object.assign(new Error("Denied"), { status: 403, code: "FORBIDDEN" }));
  expect((await PUT(request({}))).status).toBe(403);
  expect(state.db.$transaction).not.toHaveBeenCalled();
});
it("requires same origin and manage permission; logs config edits only", async () => {
  expect((await PUT(request({ ...announcementDefaults, revision: 0 }))).status).toBe(200);
  expect(state.permission).toHaveBeenCalledWith("rules.manage");
  expect(state.origin).toHaveBeenCalledOnce();
  expect(state.db.globalAnnouncementPolicy.create).toHaveBeenCalledOnce();
  expect(state.db.auditLog.create).toHaveBeenCalledOnce();
});
it("rejects stale config version", async () => {
  state.db.globalAnnouncementPolicy.updateMany.mockResolvedValue({ count: 0 });
  const response = await PUT(request({ ...announcementDefaults, revision: 1 }));
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("SETTINGS_CHANGED");
  expect(state.db.auditLog.create).not.toHaveBeenCalled();
});
it("rejects invalid config without a transaction", async () => {
  expect((await PUT(request({ ...announcementDefaults, cooldownSeconds: 0, revision: 0 }))).status).toBe(422);
  expect(state.db.$transaction).not.toHaveBeenCalled();
});
