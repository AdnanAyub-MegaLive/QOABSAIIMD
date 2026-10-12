import { describe, expect, it } from "vitest";
import {
  shouldAssignTalentPublicId,
  talentPublicIdForApprovedHost,
  userPublicIdForRemovedHost,
} from "./host-public-id";

describe("approved host public IDs", () => {
  it("restores the exact suffix on removal and supports rejoining", () => {
    expect(userPublicIdForRemovedHost("TLN-001234")).toBe("USR-001234");
    expect(userPublicIdForRemovedHost("USR-001234")).toBe("USR-001234");
    expect(talentPublicIdForApprovedHost(userPublicIdForRemovedHost("TLN-001234"))).toBe("TLN-001234");
  });
  it("keeps the numeric identifier while changing USR to TLN", () => {
    expect(talentPublicIdForApprovedHost("USR-123123")).toBe("TLN-123123");
  });

  it("does not change a host that already has a TLN ID", () => {
    expect(talentPublicIdForApprovedHost("TLN-123123")).toBe("TLN-123123");
  });

  it("only assigns a TLN ID after active host approval and verification", () => {
    expect(shouldAssignTalentPublicId({ hostEnabled: true, isVerified: true, status: "ACTIVE" })).toBe(true);
    expect(shouldAssignTalentPublicId({ hostEnabled: true, isVerified: false, status: "ACTIVE" })).toBe(true);
    expect(shouldAssignTalentPublicId({ hostEnabled: true, isVerified: true, status: "PENDING" })).toBe(false);
  });
});
