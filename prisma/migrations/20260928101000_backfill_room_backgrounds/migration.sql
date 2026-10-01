UPDATE "AudioRoom" AS room
SET
  "roomBackgroundAssetId" = equipped."assetId",
  "roomBackgroundVersion" = 1
FROM "UserEquippedProp" AS equipped
JOIN "UploadAsset" AS asset ON asset."id" = equipped."assetId"
WHERE
  equipped."userId" = room."ownerId"
  AND equipped."category" = 'ROOM_BACKGROUNDS'
  AND asset."active" = true
  AND asset."mimeType" IN ('image/png', 'image/jpeg', 'image/webp', 'video/mp4')
  AND (
    asset."isGlobal" = true
    OR EXISTS (
      SELECT 1
      FROM "UploadAssetAssignment" AS assignment
      WHERE
        assignment."assetId" = asset."id"
        AND assignment."userId" = room."ownerId"
        AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" > CURRENT_TIMESTAMP)
    )
  );
