import { createPublicDisplayAssetUrl } from "./upload-assets.js";

export function decorationMedia(asset, origin) {
  return {
    assetId: asset.publicId,
    url: createPublicDisplayAssetUrl(origin, asset),
    mimeType: asset.mimeType,
    mediaVersion: asset.mediaVersion ?? null,
    posterUrl: asset.posterMimeType ? `${createPublicDisplayAssetUrl(origin, asset.publicId, 3600, asset.posterMediaVersion)}&poster=1` : null,
    posterMimeType: asset.posterMimeType ?? null,
    posterMediaVersion: asset.posterMediaVersion ?? null,
  };
}

export function namedDecoration(prefix, media) {
  return Object.fromEntries([['Url','url'],['MimeType','mimeType'],['MediaVersion','mediaVersion'],['PosterUrl','posterUrl'],['PosterMimeType','posterMimeType'],['PosterMediaVersion','posterMediaVersion']].map(([suffix,key]) => [prefix + suffix, media?.[key] ?? null]));
}

// Copy only media fields, never wallet/private progression data or arbitrary keys.
export function perkMediaFields(perks, prefixes = ["frame", "badge", "chatBox", "businessCard", "entrance", "ride", "roomBackground"]) {
  const result = {};
  for (const prefix of prefixes) for (const suffix of ["MimeType", "MediaVersion", "PosterUrl", "PosterMimeType", "PosterMediaVersion"]) {
    const key = prefix + suffix;
    if (perks && Object.hasOwn(perks, key)) result[key] = perks[key];
  }
  return result;
}
