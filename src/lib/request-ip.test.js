import { expect, it } from "vitest";
import ip from "./request-ip.cjs";
it("overwrites spoofed headers on direct LAN requests", () => {
  const request = { socket: { remoteAddress: "::ffff:192.168.88.50" }, headers: { "x-forwarded-for": "8.8.8.8", "x-real-ip": "9.9.9.9" } };
  ip.setRequestClientIp(request, "");
  expect(request.headers).toEqual({ "x-forwarded-for": "192.168.88.50", "x-real-ip": "192.168.88.50" });
});
it("accepts valid forwarding only from an explicit trusted peer", () => {
  const request = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "192.168.88.50, 127.0.0.1" } };
  ip.setRequestClientIp(request, "127.0.0.1");
  expect(request.headers["x-real-ip"]).toBe("192.168.88.50");
});
it("falls back to peer for invalid forwarding", () => {
  const request = { socket: { remoteAddress: "::1" }, headers: { "x-forwarded-for": "invalid" } };
  ip.setRequestClientIp(request, "::1");
  expect(request.headers["x-real-ip"]).toBe("::1");
});
