import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
export const COVER_MAX_BYTES = 8 * 1024 * 1024;
const invalid = message => Object.assign(new Error(message), { code: "VALIDATION_ERROR" });
export async function decodeProfileCover(file) {
  const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
  if (!file || !formats[file.type]) throw invalid("Choose a JPEG, PNG or WebP photo.");
  if (file.size > COVER_MAX_BYTES) throw Object.assign(new Error("Cover photos cannot exceed 8 MB."), { code: "FILE_TOO_LARGE" });
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25000000, failOn: "warning" });
    const meta = await image.metadata();
    if (meta.format !== formats[file.type] || (meta.pages ?? 1) > 1) throw invalid("Invalid image.");
    return await image.rotate().resize({ width: 1080, height: 2160, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch { throw invalid("The photo is corrupt or its content does not match its type."); }
}
function signature(value) {
  if (!process.env.AUTH_SECRET) throw new Error("Cover signing is not configured.");
  return createHmac("sha256", process.env.AUTH_SECRET).update(`profile-cover:${value}`).digest("hex");
}
export function coverToken(ownerId, viewerId, revision) {
  const value = Buffer.from(JSON.stringify({ ownerId, viewerId, revision, expires: Date.now() + 900000 })).toString("base64url");
  return `${value}.${signature(value)}`;
}
export function verifyCoverToken(token) {
  try {
    const [value, sig] = String(token).split(".");
    const expected = Buffer.from(signature(value)); const actual = Buffer.from(sig ?? "");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(value, "base64url"));
    return data.expires > Date.now() ? data : null;
  } catch { return null; }
}
export async function profileCoverDto(db, ownerId, viewerId, origin) {
  const row = await db.profileCover.findUnique({ where: { userId: ownerId }, select: { status: true, revision: true } });
  const isSelf = ownerId === viewerId;
  const visible = row && (isSelf || row.status === "APPROVED");
  const path = visible ? `/api/profile-cover/file?token=${coverToken(ownerId, viewerId, row.revision)}` : null;
  return { coverImageUrl: path ? (origin ? new URL(path, origin).toString() : path) : null, coverStatus: isSelf ? row?.status ?? null : visible ? "APPROVED" : null };
}
