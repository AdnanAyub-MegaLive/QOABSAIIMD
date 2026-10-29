import { describe, expect, it } from "vitest";
import { permissionsForRole, roomPermissions } from "./audio-room-management.js";

describe("audio room permission matrix", () => {
  it("gives owners every room-management capability", () => {
    expect(Object.values(roomPermissions.OWNER).every(Boolean)).toBe(true);
  });
  it("lets delegated admins manage room music and its catalogue without managing roles", () => {
    expect(permissionsForRole("ADMIN")).toMatchObject({ canModerateMembers: true, canManageSeats: true, canManageChat: true, canManagePrivacy: true, canManageMusic: true, canManageMusicCatalog: true, canManageRoles: false });
    expect(permissionsForRole("OWNER")).toMatchObject({ canManageMusic: true, canManageMusicCatalog: true });
  });
  it("fails closed for unknown roles", () => {
    expect(Object.values(permissionsForRole("UNKNOWN")).some(Boolean)).toBe(false);
  });
});
