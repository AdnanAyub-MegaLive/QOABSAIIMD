import { describe, expect, it } from "vitest";
import { serializeUploadAsset } from "./upload-assets";

describe("serializeUploadAsset", () => {
  it("preserves Store distribution fields after a database reload", () => {
    const asset = serializeUploadAsset(
      {
        publicId: "AST-STORE",
        name: "Gold Frame",
        details: null,
        tags: [],
        category: "FRAMES",
        fileName: "gold-frame.png",
        mimeType: "image/png",
        fileSize: 1024,
        actionUrl: null,
        isGlobal: false,
        isRoomBackground: false,
        distribution: "STORE",
        storeVisible: true,
        coinPrice: 2500n,
        giftTier: null,
        minimumVipLevel: null,
        minimumRecharge: null,
        defaultGrantDurationMinutes: null,
        active: true,
        assignments: [],
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
      },
      "/api/uploads/AST-STORE/file",
    );

    expect(asset.distribution).toBe("STORE");
    expect(asset.storeVisible).toBe(true);
    expect(asset.coinPrice).toBe("2500");
  });
});
