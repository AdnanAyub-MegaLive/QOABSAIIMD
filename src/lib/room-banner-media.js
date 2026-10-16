import { createHash } from "node:crypto";
import sharp from "sharp";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "./prisma.js";
import { spacesConfig } from "./media-cdn.js";

export const BANNER_MAX_BYTES = 5 * 1024 * 1024;
export function bannerError(code, message, status = 422) { return Object.assign(new Error(message), { code, status }); }
export async function decodeBanner(bytes, mimeType) {
  const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  if (!formats[mimeType] || !bytes.length || bytes.length > BANNER_MAX_BYTES) throw bannerError("INVALID_BANNER", "Use JPG, PNG, WebP or GIF up to 5 MB.");
  try {
    const meta = await sharp(bytes, { limitInputPixels: 25000000, failOn: "warning" }).metadata();
    if (meta.format !== formats[mimeType] || (meta.pages ?? 1) > 200 || meta.width * (meta.pageHeight ?? meta.height) * (meta.pages ?? 1) > 25000000) throw Error("Invalid image");
    const image = sharp(bytes, { animated: true, limitInputPixels: 25000000, failOn: "warning" });
    // Decode every frame, resize and strip metadata without flattening animation.
    const output = await image.resize({ width: 1600, height: 900, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    if (output.length > BANNER_MAX_BYTES) throw Error("Image too large");
    return { bytes: output, mimeType: "image/webp", mediaVersion: createHash("sha256").update(output).digest("hex").slice(0, 16) };
  } catch { throw bannerError("INVALID_BANNER", "The image is corrupt, too complex or exceeds the image limits."); }
}
export async function bannerObject(action, key, bytes, mimeType = "image/webp") {
  if (!/^(private-room-banners|room-banners)\/[a-zA-Z0-9_-]+\.webp$/.test(key)) throw Error("Invalid banner key");
  const config = spacesConfig();
  if (!config) throw bannerError("BANNER_STORAGE_UNAVAILABLE", "Banner storage is not configured.", 503);
  const client = new S3Client({ endpoint: config.endpoint, region: "us-east-1", credentials: config.credentials, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED" });
  const publicFile = key.startsWith("room-banners/");
  const args = { Bucket: config.bucket, Key: key };
  // Persist cleanup intent outside the purchase transaction, including if it rolls back.
  if (action === "put") await prisma.roomBannerObject.upsert({ where: { key }, create: { key, checkAt: new Date(Date.now() + 7 * 86400000) }, update: {} });
  const command = action === "delete" ? new DeleteObjectCommand(args) : action === "get" ? new GetObjectCommand(args) : new PutObjectCommand({ ...args, Body: bytes, ACL: publicFile ? "public-read" : "private", ContentType: mimeType, CacheControl: publicFile ? "public, max-age=31536000, immutable" : "private, no-store" });
  const result = await client.send(command, { abortSignal: AbortSignal.timeout(15000) });
  return action === "get" ? result : `${config.base}/${key}`;
}
export async function bannerForm(request) {
  const reader = request.body?.getReader(); if (!reader) throw bannerError("INVALID_BANNER", "Provide an image.");
  let size = 0; const chunks = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > BANNER_MAX_BYTES + 65536) { await reader.cancel(); throw bannerError("FILE_TOO_LARGE", "Banner uploads must be at most 5 MB.", 413); } chunks.push(value); } } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw bannerError("INVALID_BANNER", "Send a multipart image upload."); }
}
