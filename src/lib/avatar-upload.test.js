import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { decodeAvatar, readAvatarFile, saveAvatar, AVATAR_MAX_BYTES } from "./avatar-upload.js";
import { verifyPublicDisplayAssetUrl } from "./upload-assets.js";

beforeEach(() => { process.env.AUTH_SECRET = "test-avatar-signature-secret-not-production"; });
const file = (bytes, type) => new File([bytes], "photo", { type });
it.each(["jpeg", "png", "webp"])("decodes %s and emits sanitized WebP", async format => {
  const input = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).toFormat(format).toBuffer();
  const output = await decodeAvatar(file(input, `image/${format}`));
  const meta = await sharp(output).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.exif).toBeUndefined();
});
it("rejects MIME mismatch, corrupt bytes, SVG and oversized files", async () => {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  for (const candidate of [file(png, "image/jpeg"), file("bad", "image/png"), file("<svg/>", "image/svg+xml")])
    await expect(decodeAvatar(candidate)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(decodeAvatar(file(new Uint8Array(AVATAR_MAX_BYTES + 1), "image/png"))).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
});
it("requires exactly one image file and valid multipart", async () => {
  for (const count of [0, 2]) {
    const form = new FormData();
    for (let i = 0; i < count; i++) form.append("image", file("x", "image/png"));
    await expect(readAvatarFile(new Request("https://portal.test", { method: "POST", body: form }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  }
  const form = new FormData(); form.append("image", file("x", "image/png"));
  expect((await readAvatarFile(new Request("https://portal.test", { method: "POST", body: form }))).size).toBe(1);
  await expect(readAvatarFile(new Request("https://portal.test", { method: "POST", body: "{}" }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
it("bounds streamed multipart bodies without Content-Length", async () => {
  const request = new Request("https://portal.test", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=a" }, body: new Uint8Array(AVATAR_MAX_BYTES + 65537) });
  await expect(readAvatarFile(request)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
});
it("creates owned asset, previous history and profile in one locked transaction", async () => {
  const tx = {
    $queryRaw: vi.fn(), user: { findUnique: vi.fn(async () => ({ profileImage: "avatar:cat" })), update: vi.fn() },
    userAvatarHistory: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(async () => [{ id: "oldest" }]), deleteMany: vi.fn() },
    userProfileSettings: { findUnique: vi.fn(async () => ({ avatarHistoryLimit: 20 })) }, uploadAsset: { create: vi.fn() },
  };
  const db = { $transaction: vi.fn(fn => fn(tx)) };
  const url = new URL(await saveAvatar(db, "actual-user", Buffer.from("encoded"), "https://portal.test"));
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.uploadAsset.create.mock.calls[0][0].data).toMatchObject({ category: "AVATARS", isGlobal: false, assignments: { create: { userId: "actual-user" } } });
  expect(tx.userAvatarHistory.create.mock.calls[0][0].data.imageUrl).toBe("avatar:cat");
  expect(tx.userAvatarHistory.deleteMany).toHaveBeenCalledWith({ where: { userId: "actual-user", id: { in: ["oldest"] } } });
  expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "actual-user" }, data: { profileImage: url.href } });
  expect(verifyPublicDisplayAssetUrl(url.pathname.split("/")[3], { expiresAt: url.searchParams.get("displayExp"), signature: url.searchParams.get("displaySig") })).toBe(true);
  tx.uploadAsset.create.mockRejectedValue(new Error("storage failure"));
  tx.user.update.mockClear();
  await expect(saveAvatar(db, "actual-user", Buffer.from("x"), "https://portal.test")).rejects.toThrow("storage failure");
  expect(tx.user.update).not.toHaveBeenCalled();
});
