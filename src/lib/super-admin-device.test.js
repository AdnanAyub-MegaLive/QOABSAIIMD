import { afterEach, describe, expect, it, vi } from "vitest";
import { rootCertificates } from "node:tls";
import { X509Certificate } from "node:crypto";
import { approvedSuperAdminDevice, deviceRestrictionApplies } from "./super-admin-device.js";

// Public certificate fixture; no test or production private keys are stored here.
const pem = rootCertificates[0];
const cert = new X509Certificate(pem);
const env = { SUPER_ADMIN_MTLS_ENABLED: "true", SUPER_ADMIN_MTLS_PROXY_SECRET: "a".repeat(64),
  SUPER_ADMIN_MTLS_FINGERPRINTS: cert.fingerprint256 };
function requestHeaders() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date((Date.parse(cert.validFrom) + Date.parse(cert.validTo)) / 2));
  return new Headers({ "x-mega-mtls-proxy-secret": env.SUPER_ADMIN_MTLS_PROXY_SECRET,
    "x-mega-client-verify": "SUCCESS", "x-mega-client-cert": encodeURIComponent(pem) });
}
afterEach(() => vi.useRealTimers());
describe("Super Admin device policy", () => {
  it("applies only to Super Admin when enabled", () => {
    expect(deviceRestrictionApplies("SUPER_ADMIN", env)).toBe(true);
    for (const role of ["ADMIN", "STAFF", "EDITOR", "MODERATOR", undefined])
      expect(deviceRestrictionApplies(role, env)).toBe(false);
    expect(deviceRestrictionApplies("SUPER_ADMIN", {})).toBe(false);
  });
  it("accepts a verified allowlisted certificate", () => {
    expect(approvedSuperAdminDevice(requestHeaders(), env)).toBe(true);
  });
  it.each(["x-mega-mtls-proxy-secret", "x-mega-client-verify", "x-mega-client-cert"])("refuses missing or forged %s", key => {
    const headers = requestHeaders();
    headers.delete(key);
    expect(approvedSuperAdminDevice(headers, env)).toBe(false);
    headers.set(key, "forged");
    expect(approvedSuperAdminDevice(headers, env)).toBe(false);
  });
  it("fails closed for unknown certificates and invalid configuration", () => {
    const headers = requestHeaders();
    for (const fingerprints of ["", "bad", "B".repeat(64), [cert.fingerprint256, cert.fingerprint256, cert.fingerprint256].join(",")])
      expect(approvedSuperAdminDevice(headers, { ...env, SUPER_ADMIN_MTLS_FINGERPRINTS: fingerprints })).toBe(false);
    expect(approvedSuperAdminDevice(headers, { ...env, SUPER_ADMIN_MTLS_PROXY_SECRET: "short" })).toBe(false);
  });
  it("refuses expired and not-yet-valid certificates", () => {
    const headers = requestHeaders();
    vi.setSystemTime(new Date(Date.parse(cert.validTo) + 1000));
    expect(approvedSuperAdminDevice(headers, env)).toBe(false);
    vi.setSystemTime(new Date(Date.parse(cert.validFrom) - 1000));
    expect(approvedSuperAdminDevice(headers, env)).toBe(false);
  });
});
