# User Tags and Profile BG

## Portal setup
- Uploads → Props → User Tags (`USER_TAGS`) is separate from Badges (`BADGES`).
- Upload a BD badge under Badges and a BD tag under User Tags. Select “BD role reward” on both. Repeat for other roles.
- The existing role reward synchronizer grants both assets when roles are assigned, and synchronizes new artwork when inventory is read. Independent purchases/manual grants are preserved when role rewards are revoked. No badge is copied into a tag automatically.
- Uploads → Props → Profile BG (`PROFILE_BG`) uses normal purchase/grant and equip rules. It has its own slot, independent of Business Cards and Profile Dresses. MP4 requires a static poster.

## App contract
Public profile `GET /api/v1/users/{publicId}/profile` returns `equippedAssets.userTag` and `equippedAssets.profileBackground`, each null or `{assetId,url,posterUrl,mimeType}`. Convenience fields: `userTagUrl`, `profileBackgroundUrl`, `profileBackgroundPosterUrl`, `profileBackgroundMimeType`.

Role tags returned in public profiles, teams and the Official directory retain `{role,roleLabel,assetId,imageUrl,mimeType}` for USER_TAGS and add `{badgeAssetId,badgeUrl,badgeMimeType}` for the matching BADGES artwork. Render both independently. Missing artwork is null; never substitute a badge as the tag. Latest active artwork for the assigned role wins.

Use the existing props inventory/purchase/equip APIs with the new category codes. Render Profile BG behind the same profile region used by Business Card; retain Business Card as an independent foreground decoration. This placement requires an app change; backend code cannot position the artwork. Keep the existing full-page Profile Dress separate.

No schema migration is needed: asset and equip categories are strings. Existing assets are not reclassified. Artwork dimensions/layout should be confirmed against the user's reference images when provided.
