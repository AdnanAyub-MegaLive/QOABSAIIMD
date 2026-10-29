import { beforeEach, expect, it, vi } from "vitest";

const { tx, prisma } = vi.hoisted(() => {
  const tx = { $executeRaw: vi.fn(), admin: { findUnique: vi.fn(), update: vi.fn() }, auditLog: { create: vi.fn() } };
  return { tx, prisma: { $transaction: vi.fn(fn => fn(tx)) } };
});
vi.mock("./prisma.js", () => ({ prisma }));
import { saveStaff } from "./portal-staff.js";
import { allPermissions } from './portal-permissions.js';
import { isDatabaseOwner } from './database-management-access.js';

const root = { id: "root", role: "SUPER_ADMIN", active: true, permissions: [], sessionVersion: 1, name: "Admin" };
const staff = { id: "staff", role: "STAFF", active: true, permissions: [], sessionVersion: 2, createdById: "root" };
const body = { action: "update", id: "staff", sessionVersion: 2, name: "Updated Staff", email: "staff@example.com", active: true, role: "STAFF", permissions: ["rooms.view", "rooms.manage"] };
beforeEach(() => {
  vi.clearAllMocks();
  tx.admin.findUnique.mockImplementation(async ({ where }) => where.id === "root" ? root : staff);
  tx.admin.update.mockImplementation(async ({ data }) => ({ ...staff, ...data, sessionVersion: 3 }));
});
it("lets Platform Admin update staff details and permissions and revokes old sessions", async () => {
  const result = await saveStaff(root, body);
  expect(result.name).toBe("Updated Staff");
  expect(result.permissions).toEqual(["rooms.manage", "rooms.view"]);
  expect(tx.admin.update).toHaveBeenCalledWith({ where: { id: "staff" }, data: expect.objectContaining({ sessionVersion: { increment: 1 } }) });
  expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "STAFF_UPDATE" }) });
});
it("rejects stale edits without updating the account", async () => {
  await expect(saveStaff(root, { ...body, sessionVersion: 1 })).rejects.toMatchObject({ status: 409 });
  expect(tx.admin.update).not.toHaveBeenCalled();
});
it("preserves protection against editing the administrator's own account", async () => {
  await expect(saveStaff(root, { ...body, id: "root", sessionVersion: 1 })).rejects.toMatchObject({ status: 403 });
  expect(tx.admin.update).not.toHaveBeenCalled();
});

it('allows Platform Admin to grant every listed permission to Staff without granting database access', async () => {
  const result = await saveStaff(root, { ...body, permissions: allPermissions });
  expect(result.permissions).toEqual([...allPermissions].sort());
  expect(tx.admin.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({createdById:root.id})}));
  expect(isDatabaseOwner({...result,email:'staff@example.com'}, 'admin@megachat.live')).toBe(false);
});
it('never allows Super Admin promotion through staff updates', async () => {
  await expect(saveStaff(root, {...body,role:'SUPER_ADMIN'})).rejects.toMatchObject({status:422});
  expect(tx.admin.update).not.toHaveBeenCalled();
});
it('pins database access to the designated email even if configuration changes', () => {
  expect(isDatabaseOwner({...root,email:'admin@megachat.live'},'admin@megachat.live')).toBe(true);
  expect(isDatabaseOwner({...root,email:'other@example.com'},'other@example.com')).toBe(false);
  expect(isDatabaseOwner({...root,email:'admin@megachat.live',role:'STAFF'},'admin@megachat.live')).toBe(false);
});
