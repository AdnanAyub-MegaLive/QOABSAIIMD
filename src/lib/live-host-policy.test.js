import { describe, expect, it } from "vitest";
import { validateLiveHost } from "./live-host-policy.js";
const host = { status: "ACTIVE", deletedAt: null, appRoles: ["HOST"], isVerified: true };
describe("live host KYC gate", () => {
  it("allows verified active hosts", () => expect(() => validateLiveHost(host)).not.toThrow());
  it("rejects unverified hosts", () => expect(() => validateLiveHost({ ...host, isVerified: false })).toThrow("KYC"));
  it.each([null, { ...host, status: "BANNED" }, { ...host, deletedAt: new Date() }, { ...host, appRoles: ["USER"] }])("rejects ineligible accounts", user => expect(() => validateLiveHost(user)).toThrow());
});
