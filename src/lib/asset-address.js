import { publicCdnUrl } from "./media-cdn-policy.js";
import { versionedUrl } from "./media-version.js";

export function hasPoster(asset) {
  return Boolean(asset?.posterMimeType || asset?.posterFileSize);
}

export function portalAssetUrl(origin, asset, { poster = false } = {}) {
  const url = new URL(`/api/uploads/${encodeURIComponent(asset.publicId)}/file`, origin);
  if (poster) url.searchParams.set("poster", "1");
  return versionedUrl(url.toString(), poster ? asset.posterMediaVersion : asset.mediaVersion);
}

export function assetAddress(asset, { origin, poster = false } = {}) {
  if (!asset?.publicId || (poster && !hasPoster(asset))) return null;
  return publicCdnUrl(asset, poster) || portalAssetUrl(origin, asset, { poster });
}
