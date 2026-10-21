import { expect, it, vi } from "vitest";
vi.mock("next/server", () => ({ NextResponse: { next: () => new Response(null) } }));
import { proxy } from "../proxy.js";

it("keeps the event login redirect relative behind a reverse proxy", () => {
  const response = proxy({ url: "http://localhost:3000/events-management", cookies: { get: () => undefined }, nextUrl: { pathname: "/events-management" } });
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/events-login?next=%2Fevents-management");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("preserves authenticated event access", () => {
  expect(proxy({ cookies: { get: () => ({ value: "session" }) } }).status).toBe(200);
});
