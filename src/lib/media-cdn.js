import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { canPublishMedia } from "./media-cdn-policy.js";

export function spacesConfig(env = process.env) {
  if (env.MEDIA_CDN_ENABLED !== "true") return null;
  const endpoint = new URL(env.SPACES_ENDPOINT || "https://sgp1.digitaloceanspaces.com");
  const base = new URL(env.MEDIA_CDN_BASE_URL || "https://media.megachat.live");
  if (endpoint.protocol !== "https:" || !/^[a-z0-9-]+\.digitaloceanspaces\.com$/.test(endpoint.hostname)
      || endpoint.username || endpoint.password || base.protocol !== "https:" || base.username || base.password
      || base.pathname !== "/" || base.search || base.hash) throw new Error("Invalid Spaces/CDN configuration.");
  if (!env.SPACES_ACCESS_KEY_ID || !env.SPACES_SECRET_ACCESS_KEY || !env.SPACES_BUCKET) throw new Error("Spaces credentials and bucket are required when CDN is enabled.");
  return { endpoint: endpoint.origin, base: base.origin, bucket: env.SPACES_BUCKET,
    credentials: { accessKeyId: env.SPACES_ACCESS_KEY_ID, secretAccessKey: env.SPACES_SECRET_ACCESS_KEY } };
}
export function mediaKey(assetId, bytes, mimeType, poster = false) {
  if (!/^[A-Za-z0-9_-]+$/.test(assetId)) throw new Error("Invalid asset ID.");
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4" }[mimeType];
  if (!ext) throw new Error("Unsupported public CDN media type.");
  const hash = createHash("sha256").update(bytes).update(mimeType).digest("hex");
  return `portal-media/${assetId}/${poster ? "poster-" : ""}${hash}.${ext}`;
}
export async function publishMedia(asset, { config = spacesConfig(), client } = {}) {
  if (!config || !canPublishMedia(asset)) return null;
  client ??= new S3Client({ endpoint: config.endpoint, region: "us-east-1", forcePathStyle: false,
    credentials: config.credentials, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED" });
  async function put(bytes, mimeType, poster) {
    const Key = mediaKey(asset.publicId, bytes, mimeType, poster);
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key, Body: bytes, ACL: "public-read",
      ContentType: mimeType, ContentDisposition: "inline", CacheControl: "public, max-age=86400, immutable" }),
      { abortSignal: AbortSignal.timeout(30000) });
    return `${config.base}/${Key}`;
  }
  const cdnUrl = await put(asset.fileData, asset.mimeType, false);
  const posterCdnUrl = asset.posterFileData ? await put(asset.posterFileData, asset.posterMimeType, true) : null;
  return { cdnUrl, posterCdnUrl };
}

// Network I/O happens after the database commit. A failed mirror never destroys
// the original; rerun the backfill to repair it. Compare version before linking.
export async function mirrorAsset(db, asset) {
  const urls = await publishMedia(asset);
  if (!urls) return asset;
  const result = await db.uploadAsset.updateMany({ where: { id: asset.id, updatedAt: asset.updatedAt }, data: { ...urls, updatedAt: asset.updatedAt } });
  return result.count ? { ...asset, ...urls } : asset;
}
export async function mirrorAssetBestEffort(db, asset) {
  try { return await mirrorAsset(db, asset); }
  catch (error) {
    console.error("CDN mirror failed; database original retained", { assetId: asset.publicId, code: error.name });
    return asset;
  }
}
