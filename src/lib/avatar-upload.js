import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { updateProfileWithHistory } from "./avatar-history.js";
import { createPublicDisplayAssetUrl } from "./upload-assets.js";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
function invalid(message, code = "VALIDATION_ERROR") {
  return Object.assign(new Error(message), { code });
}

// Bound the body even when Content-Length is absent or dishonest.
export async function readAvatarFile(request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;"))
    throw invalid("Send multipart/form-data with one image field.");
  const limit = AVATAR_MAX_BYTES + 65536;
  if (Number(request.headers.get("content-length")) > limit) throw invalid("Avatar cannot exceed 5 MB.", "FILE_TOO_LARGE");
  if (!request.body) throw invalid("An image is required.");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw invalid("Avatar cannot exceed 5 MB.", "FILE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") } }).formData();
  } catch { throw invalid("Malformed multipart image upload."); }
  const files = form.getAll("image");
  if (files.length !== 1 || !(files[0] instanceof File) || !files[0].size)
    throw invalid("Exactly one non-empty image file is required.");
  if (files[0].size > AVATAR_MAX_BYTES) throw invalid("Avatar cannot exceed 5 MB.", "FILE_TOO_LARGE");
  return files[0];
}

export async function decodeAvatar(file) {
  if (!formats[file.type]) throw invalid("Image must be JPEG, PNG or WebP.");
  if (file.size > AVATAR_MAX_BYTES) throw invalid("Avatar cannot exceed 5 MB.", "FILE_TOO_LARGE");
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25000000, failOn: "warning", animated: false });
    const meta = await image.metadata();
    if (meta.format !== formats[file.type] || (meta.pages ?? 1) > 1) throw new Error("Invalid image");
    // Fully decode, orient, resize and re-encode; never retain EXIF/location metadata.
    return await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw invalid("Image content is invalid or does not match its declared type."); }
}

export async function saveAvatar(db, userId, bytes, origin) {
  const publicId = `AVATAR-${randomUUID().replaceAll("-", "")}`;
  const profileImage = createPublicDisplayAssetUrl(origin, publicId, 30 * 24 * 3600);
  await updateProfileWithHistory(db, userId, { profileImage }, tx => tx.uploadAsset.create({ data: {
    publicId, name: "Profile picture", category: "AVATARS", fileName: `${publicId}.webp`,
    mimeType: "image/webp", fileSize: bytes.length, fileData: bytes, isGlobal: false, storeVisible: false,
    assignments: { create: { userId } },
  } }));
  return profileImage;
}
