import sharp from "sharp";
import { prisma } from "./prisma.js";
import { validationError } from "./wallet.js";
export const COVER_LIMIT = 5 * 1024 * 1024;
export async function decodeLiveCover(bytes, mime) {
  const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
  if (!formats[mime] || !bytes.length || bytes.length > COVER_LIMIT) throw validationError("Cover must be JPEG, PNG or WebP, up to 5 MB.");
  try {
    const image = sharp(bytes, { limitInputPixels: 25000000, animated: false, failOn: "warning" });
    const meta = await image.metadata();
    if (meta.format !== formats[mime] || (meta.pages ?? 1) > 1) throw new Error("Invalid format");
    return await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw validationError("Cover contains invalid or unsupported image content."); }
}
export async function validateLiveCover(value, userId, origin, db = prisma) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw validationError("Invalid cover URL.");
  let url;
  try { url = new URL(value, origin); } catch { throw validationError("Invalid cover URL."); }
  const match = /^\/api\/v1\/live-video\/cover\/([a-f0-9-]{36})$/.exec(url.pathname);
  if (url.origin !== new URL(origin).origin || url.username || url.password || url.search || url.hash || !match) throw validationError("Use a cover uploaded to this portal.");
  const cover = await db.videoLiveCover.findFirst({ where: { id: match[1], userId }, select: { id: true } });
  if (!cover) throw validationError("This cover does not belong to your account.");
  return url.pathname;
}
