import { describe, expect, it } from "vitest";
import { isSupportedSeatStyleMimeType, serializeRoomSeatStyle } from "./room-seat-style.js";

describe("room seat style contract", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("supports %s", (mimeType) => {
    expect(isSupportedSeatStyleMimeType(mimeType)).toBe(true);
  });
  it.each(["video/mp4", "image/svg+xml", "text/html"])("rejects %s", (mimeType) => {
    expect(isSupportedSeatStyleMimeType(mimeType)).toBe(false);
  });

it("returns a versioned reset descriptor", () => {
  expect(serializeRoomSeatStyle({ seatStyleVersion: 4 }, "https://portal.test")).toEqual({
    assetId: null, url: null, mimeType: null, version: 4,
  });
});

it("rejects an expired owner entitlement", () => {
  const room = {
    ownerId: "owner-1", seatStyleVersion: 2,
    seatStyleAsset: { publicId: "AST-1", mimeType: "image/webp", active: true, isGlobal: false, assignments: [{ userId: "owner-1", expiresAt: new Date(Date.now() - 1000) }] },
  };
  expect(serializeRoomSeatStyle(room, "https://portal.test").assetId).toBeNull();
});

it("exposes an active owned asset", () => {
  process.env.AUTH_SECRET ||= "seat-style-test-secret";
  const room = {
    ownerId: "owner-1", seatStyleVersion: 3,
    seatStyleAsset: { publicId: "AST-1", mimeType: "image/webp", active: true, isGlobal: false, assignments: [{ userId: "owner-1", expiresAt: null }] },
  };
  const descriptor = serializeRoomSeatStyle(room, "https://portal.test");
  expect(descriptor.assetId).toBe("AST-1");
  expect(descriptor.version).toBe(3);
  expect(descriptor.url).toContain("/api/uploads/AST-1/file");
});
});
