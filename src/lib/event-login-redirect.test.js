import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { proxy } from "../proxy.js";

beforeEach(() => { vi.stubEnv("AUTH_URL", ""); vi.stubEnv("MOBILE_API_BASE_URL", ""); });
afterEach(() => vi.unstubAllEnvs());
const request = () => ({ url: "http://localhost:3000/events-management", cookies: { get: () => undefined },
  headers: new Headers({ "x-forwarded-host": "portal.megachat.live", "x-forwarded-proto": "https" }),
  nextUrl: { pathname: "/events-management", search: "?page=2" } });
it("returns an absolute public redirect accepted by the Next proxy adapter", () => {
  const response = proxy(request());
  expect(response.status).toBe(307);
  const url = new URL(response.headers.get("location"));
  expect(url.origin).toBe("https://portal.megachat.live");
  expect(url.pathname).toBe("/events-login");
  expect(url.searchParams.get("next")).toBe("/events-management?page=2");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("prefers configured origin over forwarded headers", () => {
  vi.stubEnv("AUTH_URL", "https://portal.example");
  expect(new URL(proxy(request()).headers.get("location")).origin).toBe("https://portal.example");
});
it("supports local requests and skips invalid configuration", () => {
  vi.stubEnv("AUTH_URL", "null");
  expect(new URL(proxy({ ...request(), headers: new Headers() }).headers.get("location")).origin).toBe("http://localhost:3000");
});

it("preserves authenticated event access", () => {
  expect(proxy({ cookies: { get: () => ({ value: "session" }) } }).status).toBe(200);
});
