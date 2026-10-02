import { describe, expect, it } from "vitest";
import { syncResellerProps } from "./reseller-props.js";
import { normalizeApplicationRoles, primaryLegacyRole } from "./user-roles.js";

function fixture(roles = ["RESELLER"]) {
  const user = { appRoles: roles, deletedAt: null };
  const assets = [{ id: "badge", defaultGrantDurationMinutes: 60 }];
  const grants = new Map();
  const client = {
    user: { findUnique: async () => user },
    uploadAsset: { findMany: async () => assets },
    uploadAssetAssignment: {
      deleteMany: async ({ where }) => {
        for (const [id, grant] of grants) {
          if (grant.source === where.source && !where.assetId.notIn.includes(id)) grants.delete(id);
        }
      },
      upsert: async ({ create }) => {
        if (!grants.has(create.assetId)) grants.set(create.assetId, create);
      },
    },
  };
  return { user, assets, grants, client };
}

describe("Reseller role rewards", () => {
  it("accepts Reseller without assigning a privileged legacy role", () => {
    expect(normalizeApplicationRoles(["Reseller", "Listener"])).toEqual(["RESELLER", "LISTENER"]);
    expect(primaryLegacyRole(["RESELLER"])).toBe("LISTENER");
  });
  it("grants configured rewards once and does not renew timed ownership on reads", async () => {
    const f = fixture();
    await syncResellerProps("user", f.client);
    const grant = f.grants.get("badge");
    expect(grant.source).toBe("RESELLER");
    expect(grant.expiresAt - grant.assignedAt).toBe(3600000);
    grant.expiresAt = new Date(0);
    await syncResellerProps("user", f.client);
    expect(f.grants.get("badge").expiresAt.getTime()).toBe(0);
  });
  it("revokes only role rewards when the role is removed", async () => {
    const f = fixture();
    await syncResellerProps("user", f.client);
    f.grants.set("purchased", { source: "STORE" });
    f.user.appRoles = ["LISTENER"];
    await syncResellerProps("user", f.client);
    expect([...f.grants.keys()]).toEqual(["purchased"]);
  });
  it("preserves independent manual ownership and removes disabled role rewards", async () => {
    const f = fixture();
    f.grants.set("badge", { source: "ADMIN", expiresAt: null });
    await syncResellerProps("user", f.client);
    expect(f.grants.get("badge").source).toBe("ADMIN");
    f.grants.set("old", { source: "RESELLER" });
    await syncResellerProps("user", f.client);
    expect(f.grants.has("old")).toBe(false);
  });
});
