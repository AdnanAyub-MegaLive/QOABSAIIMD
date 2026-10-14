import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { validateCoverVideo } from "./profile-cover-video.js";
export const COVER_MAX_BYTES = 8 * 1024 * 1024;
const invalid = message => Object.assign(new Error(message), { code: "VALIDATION_ERROR" });
export async function decodeProfileCover(file) {
  if (file?.type === "video/mp4") {
    if (file.size > 20 * 1024 * 1024) throw Object.assign(new Error("Cover videos cannot exceed 20 MB."), {code:"FILE_TOO_LARGE"});
    const bytes=Buffer.from(await file.arrayBuffer());await validateCoverVideo(bytes);return bytes;
  }
  const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  if (!file || !formats[file.type]) throw invalid("Choose a JPEG, PNG, WebP or GIF photo.");
  if (file.size > COVER_MAX_BYTES) throw Object.assign(new Error("Cover photos cannot exceed 8 MB."), { code: "FILE_TOO_LARGE" });
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = sharp(bytes, { limitInputPixels: 25000000, failOn: "warning", animated: file.type === "image/gif" });
    const meta = await image.metadata();
    if (meta.format !== formats[file.type] || (meta.pages ?? 1) > (file.type === "image/gif" ? 200 : 1)) throw invalid("Invalid image.");
    if (file.type === "image/gif") {
      // Force a complete decode with bounded pixels before retaining the original animation.
      await image.stats();
      return bytes;
    }
    return await image.rotate().resize({ width: 1080, height: 2160, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch { throw invalid("The photo is corrupt or its content does not match its type."); }
}
function signature(value) {
  if (!process.env.AUTH_SECRET) throw new Error("Cover signing is not configured.");
  return createHmac("sha256", process.env.AUTH_SECRET).update(`profile-cover:${value}`).digest("hex");
}
export function coverToken(ownerId, viewerId, revision, coverId = null) {
  const value = Buffer.from(JSON.stringify({ ownerId, viewerId, revision, coverId, expires: Date.now() + 900000 })).toString("base64url");
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
  const row = await db.profileCover.findUnique({ where: { userId: ownerId }, select: { status: true, revision: true, mimeType: true, createdAt:true } });
  const isSelf = ownerId === viewerId;
  const visible = row && (isSelf || row.status === "APPROVED");
  const path = visible ? `/api/profile-cover/file?token=${coverToken(ownerId, viewerId, row.revision)}` : null;
  const items = await db.profileCoverItem.findMany({where:{userId:ownerId,...(!isSelf?{status:"APPROVED"}:{})},select:{id:true,mimeType:true,status:true,revision:true,createdAt:true},orderBy:[{createdAt:"asc"},{id:"asc"}],take:5});
  const entries=items.map(item=>{const url=`/api/profile-cover/file?token=${coverToken(ownerId,viewerId,item.revision,item.id)}`;return {id:item.id,createdAt:item.createdAt,coverImageUrl:origin?new URL(url,origin).toString():url,coverMimeType:item.mimeType,coverStatus:item.status};});
  if(visible)entries.push({id:"legacy",createdAt:row.createdAt,coverImageUrl:origin?new URL(path,origin).toString():path,coverMimeType:row.mimeType??"image/webp",coverStatus:row.status});
  const covers=entries.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)||a.id.localeCompare(b.id)).slice(0,5).map(({createdAt: _createdAt,...item})=>item);
  return { coverImageUrl: covers[0]?.coverImageUrl??null, coverMimeType:covers[0]?.coverMimeType??null, coverStatus: isSelf ? row?.status ?? covers[0]?.coverStatus??null : covers.length?"APPROVED":null, covers };
}
