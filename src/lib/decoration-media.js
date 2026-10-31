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

// Public presentation capabilities and media only; never wallet/private data or arbitrary keys.
export function perkMediaFields(perks, prefixes = ["frame", "badge", "chatBox", "businessCard", "entrance", "ride", "roomBackground", "userTag", "seatStyle"]) {
  const result = { vipPrivileges: perks?.vipPrivileges ?? [], vipLevel: perks?.vipLevel ?? 0, vipNameColor: perks?.vipNameColor ?? null,
    specialId: perks?.specialId ?? null, vipTagUrl: perks?.vipTagUrl ?? null, vipTagMimeType: perks?.vipTagMimeType ?? null, vipTagPosterUrl: perks?.vipTagPosterUrl ?? null };
  for (const prefix of prefixes) for (const suffix of ["MimeType", "MediaVersion", "PosterUrl", "PosterMimeType", "PosterMediaVersion"]) {
    const key = prefix + suffix;
    if (perks && Object.hasOwn(perks, key)) result[key] = perks[key];
  }
  return result;
}
