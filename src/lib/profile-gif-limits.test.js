import { it, expect } from "vitest";
import sharp from "sharp";
import { decodeAvatar, readAvatarFile, AVATAR_GIF_MAX_BYTES } from "./avatar-upload.js";
import { decodeProfileCover, COVER_GIF_MAX_BYTES } from "./profile-cover.js";

it("accepts GIFs at 25 MB through the multipart reader and both decoders", async () => {
  const gif = await sharp(Buffer.from([255,0,0,0,255,0]), { raw: { width: 1, height: 2, channels: 3, pageHeight: 1 } }).gif({ delay: [100,100], loop: 0 }).toBuffer();
  // Valid GIF with trailing padding tests the byte boundary without excessive decoded pixels.
  const bytes = Buffer.concat([gif, Buffer.alloc(AVATAR_GIF_MAX_BYTES - gif.length)]);
  const form = new FormData(); form.append("image", new File([bytes], "avatar.gif", { type: "image/gif" }));
  const file = await readAvatarFile(new Request("https://portal.test", { method: "POST", body: form }), AVATAR_GIF_MAX_BYTES);
  expect(file.size).toBe(25 * 1024 * 1024); expect(COVER_GIF_MAX_BYTES).toBe(AVATAR_GIF_MAX_BYTES);
  expect((await sharp(await decodeAvatar(file), { animated: true }).metadata()).pages).toBe(2);
  expect((await decodeProfileCover(file)).length).toBe(bytes.length);
});
it("rejects GIFs above 25 MB and preserves other type limits", async () => {
  for (const decode of [decodeAvatar, decodeProfileCover]) await expect(decode({ type: "image/gif", size: AVATAR_GIF_MAX_BYTES + 1 })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  await expect(decodeAvatar({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  await expect(decodeProfileCover({ type: "image/png", size: 8 * 1024 * 1024 + 1 })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  await expect(decodeProfileCover({ type: "video/mp4", size: 20 * 1024 * 1024 + 1 })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
});
