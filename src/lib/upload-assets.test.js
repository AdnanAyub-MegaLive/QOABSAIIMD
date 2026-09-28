import { describe, expect, it } from "vitest";
import {
  bannerMimeTypes,
  bannerCatalogOrderBy,
  bannerCatalogWhere,
  cleanBannerActionUrl,
  cleanBannerPlacement,
  cleanSortOrder,
  serializeUploadAsset,
  createSignedAssetUrl,
  verifySignedAssetUrl,
  validateUploadAssetContract,
} from "./upload-assets";

describe("business-card assets", () => {
  it("accepts supported media and rejects WebM", () => {
    expect(validateUploadAssetContract({ category: "BUSINESS_CARD", mimeType: "video/mp4" })).toEqual({ placement: null });
    expect(() => validateUploadAssetContract({ category: "BUSINESS_CARD", mimeType: "video/webm" })).toThrow("Business cards");
  });
});

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

describe("banner upload contract", () => {
  it.each(["PARTY", "HOT_TOP", "HOT_MID"])(
    "accepts the %s placement",
    (placement) => {
      expect(cleanBannerPlacement(placement, { required: true })).toBe(placement);
    },
  );

  it.each([undefined, "", "HOT", "party", "BANNERS"])(
    "rejects missing or invalid placement %s",
    (placement) => {
      expect(() => cleanBannerPlacement(placement, { required: true })).toThrow();
    },
  );

  it("rejects placement metadata on non-banner assets", () => {
    expect(() =>
      validateUploadAssetContract({ category: "FRAMES", placement: "PARTY" }),
    ).toThrow("only supported for banner");
  });

  it("allows only rights-approved banner image MIME types", () => {
    expect([...bannerMimeTypes]).toEqual(["image/png", "image/jpeg", "image/webp"]);
    expect(() =>
      validateUploadAssetContract({
        category: "BANNERS",
        placement: "PARTY",
        mimeType: "image/gif",
      }),
    ).toThrow("PNG, JPEG, or WebP");
  });

  it("normalizes HTTPS action URLs and allows an empty destination", () => {
    expect(cleanBannerActionUrl(" ")).toBeNull();
    expect(cleanBannerActionUrl("https://example.com/banner?q=1")).toBe(
      "https://example.com/banner?q=1",
    );
    expect(() => cleanBannerActionUrl("http://example.com")).toThrow("HTTPS");
    expect(() => cleanBannerActionUrl("javascript:alert(1)")).toThrow("HTTPS");
    expect(() => cleanBannerActionUrl("data:text/html,test")).toThrow("HTTPS");
    expect(() => cleanBannerActionUrl("file:///tmp/banner.png")).toThrow("HTTPS");
  });

  it("accepts stable non-negative integer sort orders", () => {
    expect(cleanSortOrder("4")).toBe(4);
    expect(cleanSortOrder(undefined)).toBe(0);
    expect(() => cleanSortOrder("1.5")).toThrow();
    expect(() => cleanSortOrder(-1)).toThrow();
  });

  it("isolates active global banners by exact placement with stable ordering", () => {
    expect(bannerCatalogWhere("HOT_MID")).toEqual({
      category: "BANNERS",
      placement: "HOT_MID",
      active: true,
      isGlobal: true,
    });
    expect(bannerCatalogOrderBy).toEqual([
      { sortOrder: "asc" },
      { createdAt: "asc" },
      { publicId: "asc" },
    ]);
  });

  it("issues verifiable signed file URLs and rejects expired signatures", () => {
    const previousSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "test-secret-for-upload-signatures";
    try {
      const validUrl = new URL(
        createSignedAssetUrl("https://portal.example", "AST-BANNER", "USR-1", 3),
      );
      expect(
        verifySignedAssetUrl("AST-BANNER", {
          userId: validUrl.searchParams.get("uid"),
          sessionVersion: validUrl.searchParams.get("sv"),
          expiresAt: validUrl.searchParams.get("exp"),
          signature: validUrl.searchParams.get("sig"),
        }),
      ).toMatchObject({ userId: "USR-1", sessionVersion: 3 });

      const expiredUrl = new URL(
        createSignedAssetUrl("https://portal.example", "AST-BANNER", "USR-1", 3, -1),
      );
      expect(
        verifySignedAssetUrl("AST-BANNER", {
          userId: expiredUrl.searchParams.get("uid"),
          sessionVersion: expiredUrl.searchParams.get("sv"),
          expiresAt: expiredUrl.searchParams.get("exp"),
          signature: expiredUrl.searchParams.get("sig"),
        }),
      ).toBeNull();
    } finally {
      if (previousSecret === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = previousSecret;
    }
  });

  it("serializes the canonical banner catalogue fields", () => {
    const asset = serializeUploadAsset(
      {
        publicId: "AST-BANNER",
        name: "Weekend Event",
        details: null,
        tags: [],
        category: "BANNERS",
        fileName: "weekend.webp",
        mimeType: "image/webp",
        fileSize: 1200,
        actionUrl: "https://example.com/weekend",
        placement: "HOT_TOP",
        sortOrder: 1,
        isGlobal: true,
        isRoomBackground: false,
        distribution: "MARKETING",
        active: true,
        assignments: [],
        createdAt: new Date("2026-09-21T11:00:00.000Z"),
        updatedAt: new Date("2026-09-21T12:00:00.000Z"),
      },
      "https://portal.example/api/uploads/AST-BANNER/file?sig=test",
    );
    expect(asset).toMatchObject({
      id: "AST-BANNER",
      category: "BANNERS",
      placement: "HOT_TOP",
      sortOrder: 1,
      mimeType: "image/webp",
      actionUrl: "https://example.com/weekend",
      updatedAt: "2026-09-21T12:00:00.000Z",
    });
  });
});
