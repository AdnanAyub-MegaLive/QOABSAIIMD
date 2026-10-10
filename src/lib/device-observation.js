import { isIP } from "node:net";

// Values must come from headers already sanitized by the custom server.
// A missing/loopback observation is not evidence that a stored client IP changed.
export function observedDeviceIp(value) {
  const ip = typeof value === "string" ? value.trim().replace(/^::ffff:/i, "") : "";
  if (!isIP(ip) || ip === "::1" || ip === "::" || ip === "0.0.0.0" || ip.startsWith("127.")) return null;
  return ip;
}
export function observedDeviceLocation(value) {
  const location = typeof value === "string" ? value.trim().slice(0, 500) : "";
  return !location || /^(unknown|unknown location|unknown,\s*unknown|n\/a|null|undefined|not available)$/i.test(location) ? null : location;
}
