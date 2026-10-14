import { createPublicDisplayAssetUrl } from "./upload-assets.js";

// Posters have their own content version; never reuse an animation's v parameter.
// The authenticated file handler redirects eligible public files to the CDN.
export function giftMedia(asset, origin) {
  return {
    mimeType: asset.mimeType,
    mediaUrl: createPublicDisplayAssetUrl(origin, asset),
    mediaVersion: asset.mediaVersion ?? null,
    posterMimeType: asset.posterMimeType ?? null,
    posterMediaVersion: asset.posterMediaVersion ?? null,
    posterUrl: asset.posterMimeType
      ? `${createPublicDisplayAssetUrl(origin, asset.publicId, 3600, asset.posterMediaVersion)}&poster=1`
      : null,
  };
}
