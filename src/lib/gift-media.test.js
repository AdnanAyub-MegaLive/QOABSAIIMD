import { expect, it, vi, afterEach } from "vitest";
import { giftMedia } from "./gift-media.js";
import { verifyPublicDisplayAssetUrl } from "./upload-assets.js";
afterEach(() => vi.unstubAllEnvs());
it("returns canonical SVGA MIME with independent, signed animation/poster versions", () => {
  vi.stubEnv("AUTH_SECRET", "test-only-secret");
  const result = giftMedia({ publicId: "AST-1", mimeType: "application/svga", mediaVersion: "abc", posterMimeType: "image/webp", posterMediaVersion: "def" }, "https://portal.test");
  expect(result).toMatchObject({ mimeType: "application/svga", mediaVersion: "abc", posterMimeType: "image/webp", posterMediaVersion: "def" });
  for (const [url, version] of [[result.mediaUrl, "abc"], [result.posterUrl, "def"]]) {
    const u = new URL(url);
    expect(u.searchParams.get("v")).toBe(version);
    expect(verifyPublicDisplayAssetUrl("AST-1", { signature: u.searchParams.get("displaySig"), expiresAt: u.searchParams.get("displayExp") })).toBe(true);
  }
  expect(new URL(result.posterUrl).searchParams.get("poster")).toBe("1");
});
it("returns explicit nulls for optional posters", () => {
  vi.stubEnv("AUTH_SECRET", "test-only-secret");
  expect(giftMedia({ publicId: "AST-1", mimeType: "application/svga" }, "https://portal.test")).toMatchObject({ posterUrl: null, posterMimeType: null, posterMediaVersion: null });
});
