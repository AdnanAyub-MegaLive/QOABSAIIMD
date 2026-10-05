import { expect, it, vi } from "vitest";
import { unlinkBDAgency } from "./agency-management.js";
function database() {
  return { user: { findUnique: vi.fn(async () => ({ id: "bd", publicId: "USR-BD", appRoles: ["BD"], status: "ACTIVE" })) }, agency: { findFirst: vi.fn(async () => ({ id: "agency", publicId: "AGN-1" })), updateMany: vi.fn(async () => ({ count: 1 })) }, auditLog: { create: vi.fn() } };
}
it("scopes unlink to the caller and only clears the BD assignment", async () => {
  const db = database();
  expect(await unlinkBDAgency(db, "bd", "AGN-1")).toEqual({ agencyId: "AGN-1", unlinked: true });
  expect(db.agency.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { publicId: "AGN-1", bdUserId: "bd" } }));
  expect(db.agency.updateMany).toHaveBeenCalledWith({ where: { id: "agency", bdUserId: "bd" }, data: { bdUserId: null } });
  expect(db.auditLog.create).toHaveBeenCalledTimes(1);
});
it("rejects missing, foreign or already-unlinked agencies without writes", async () => {
  const db = database(); db.agency.findFirst.mockResolvedValue(null);
  await expect(unlinkBDAgency(db, "bd", "AGN-1")).rejects.toThrow("BD_AGENCY_NOT_FOUND");
  expect(db.agency.updateMany).not.toHaveBeenCalled(); expect(db.auditLog.create).not.toHaveBeenCalled();
});
it("rechecks BD authorization within the transaction", async () => {
  const db = database(); db.user.findUnique.mockResolvedValue({ status: "ACTIVE", appRoles: ["LISTENER"] });
  await expect(unlinkBDAgency(db, "bd", "AGN-1")).rejects.toThrow("BD_REQUIRED");
  expect(db.agency.updateMany).not.toHaveBeenCalled();
});
it("rejects an assignment changed concurrently and does not audit success", async () => {
  const db = database(); db.agency.updateMany.mockResolvedValue({ count: 0 });
  await expect(unlinkBDAgency(db, "bd", "AGN-1")).rejects.toThrow("BD_AGENCY_NOT_FOUND");
  expect(db.auditLog.create).not.toHaveBeenCalled();
});
