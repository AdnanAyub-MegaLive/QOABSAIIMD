import { afterEach, describe, expect, it } from "vitest";
import { sameOrigin } from "./http.js";

const original = {
  AUTH_URL: process.env.AUTH_URL,
  MOBILE_API_BASE_URL: process.env.MOBILE_API_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("game portal origin validation", () => {
  it("accepts the configured mobile portal origin", () => {
    process.env.MOBILE_API_BASE_URL = "http://192.168.88.49:3000";
    expect(() => sameOrigin(new Request("http://127.0.0.1:3000/api/games/player", { headers: { origin: "http://192.168.88.49:3000" } }))).not.toThrow();
  });

  it("accepts the direct request origin during local development", () => {
    process.env.NODE_ENV = "development";
    process.env.MOBILE_API_BASE_URL = "http://192.168.88.49:3000";
    expect(() => sameOrigin(new Request("http://localhost:3000/api/games/player", { headers: { origin: "http://localhost:3000" } }))).not.toThrow();
  });

  it("accepts another private LAN or loopback origin during development", () => {
    process.env.NODE_ENV = "development";
    process.env.MOBILE_API_BASE_URL = "http://192.168.88.49:3000";
    expect(() => sameOrigin(new Request("http://192.168.88.49:3000/api/games/admin", { headers: { origin: "http://localhost:3000" } }))).not.toThrow();
    expect(() => sameOrigin(new Request("http://192.168.88.49:3000/api/games/admin", { headers: { origin: "http://192.168.88.77:3000" } }))).not.toThrow();
  });

  it("rejects a different browser origin", () => {
    process.env.NODE_ENV = "production";
    process.env.MOBILE_API_BASE_URL = "https://portal.example.com";
    expect(() => sameOrigin(new Request("http://internal:3000/api/games/player", { headers: { origin: "https://evil.example" } }))).toThrow("configured origin");
  });
});
