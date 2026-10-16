import { expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { decodeBanner, BANNER_MAX_BYTES } from "./room-banner-media.js";
it("preserves animation when converting GIF banners", async () => {
  const gif = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), { raw: { width: 1, height: 2, channels: 3, pageHeight: 1 } }).gif({ delay: [100, 100], loop: 0 }).toBuffer();
  const result = await decodeBanner(gif, "image/gif");
  expect((await sharp(result.bytes, { animated: true }).metadata()).pages).toBe(2);
});
it("validates decoded content and returns versioned metadata-stripped WebP", async () => {
  const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  const result = await decodeBanner(png, "image/png"); expect(result.mimeType).toBe("image/webp"); expect(result.mediaVersion).toMatch(/^[a-f0-9]{16}$/);
  await expect(decodeBanner(png, "image/jpeg")).rejects.toMatchObject({ code: "INVALID_BANNER" });
  await expect(decodeBanner(Buffer.from("GIF89a broken"), "image/gif")).rejects.toMatchObject({ code: "INVALID_BANNER" });
  await expect(decodeBanner(Buffer.alloc(BANNER_MAX_BYTES + 1), "image/png")).rejects.toMatchObject({ code: "INVALID_BANNER" });
});
