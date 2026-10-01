import { describe, expect, it } from "vitest";
import { isSupportedRoomBackgroundMimeType, serializeRoomBackground } from "./room-background";

describe("room-specific background contract", () => {
  it.each(["image/png", "image/jpeg", "image/webp", "video/mp4"])("supports %s", (mimeType) => {
    expect(isSupportedRoomBackgroundMimeType(mimeType)).toBe(true);
  });

  it.each(["image/gif", "video/webm", "text/html"])("rejects %s", (mimeType) => {
    expect(isSupportedRoomBackgroundMimeType(mimeType)).toBe(false);
  });

  it("preserves the version when the default background is selected", () => {
    expect(serializeRoomBackground({ roomBackgroundAsset: null, roomBackgroundVersion: 4 }, "https://portal.example")).toEqual({
      assetId: null,
      url: null,
      mimeType: null,
      version: 4,
    });
  });
});
