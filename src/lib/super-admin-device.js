import { timingSafeEqual, X509Certificate } from "node:crypto";

export function deviceRestrictionApplies(role, env = process.env) {
  return role === "SUPER_ADMIN" && env.SUPER_ADMIN_MTLS_ENABLED === "true";
}

// Nginx verifies the certificate chain. A private proxy secret authenticates
// that assertion, including when the application port is accessed directly.
export function approvedSuperAdminDevice(headers, env = process.env) {
  try {
    const secret = env.SUPER_ADMIN_MTLS_PROXY_SECRET || "";
    const supplied = headers.get("x-mega-mtls-proxy-secret") || "";
    if (secret.length < 64 || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) return false;
    if (headers.get("x-mega-client-verify") !== "SUCCESS") return false;
    const allowed = (env.SUPER_ADMIN_MTLS_FINGERPRINTS || "").split(",").map(s => s.trim().replaceAll(":", "").toUpperCase());
    if (allowed.length > 2 || allowed.some(s => !/^[A-F0-9]{64}$/.test(s))) return false;
    const pem = headers.get("x-mega-client-cert") || "";
    if (pem.length > 16384) return false;
    const certificate = new X509Certificate(decodeURIComponent(pem));
    const now = Date.now();
    if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) return false;
    return allowed.includes(certificate.fingerprint256.replaceAll(":", "").toUpperCase());
  } catch {
    return false;
  }
}
