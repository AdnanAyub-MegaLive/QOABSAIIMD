import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { publicAge, wallCursor, wallOffset } from "./public-profile.js";
describe("profile contract helpers", () => {
  it("never calculates public age when birth date is private", () => {
    expect(publicAge(new Date("2000-10-25"), false)).toBeNull();
    expect(publicAge(new Date("2000-10-25"), true, new Date("2026-10-08"))).toBe(25);
    expect(publicAge(new Date("2000-10-25"), true, new Date("2026-10-25"))).toBe(26);
  });
  it("validates opaque wall cursors", () => {
    expect(wallOffset(wallCursor(20))).toBe(20);
    expect(() => wallOffset("invalid")).toThrow("INVALID_CURSOR");
    expect(() => wallOffset(wallCursor(-1))).toThrow("INVALID_CURSOR");
  });
});
