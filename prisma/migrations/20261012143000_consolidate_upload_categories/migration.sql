ALTER TABLE "UploadAsset" ADD COLUMN "giftCategory" TEXT;
UPDATE "UploadAsset" SET "giftCategory" = CASE
  WHEN "giftTier" IN ('VIP', 'LUCKY') THEN "giftTier"
  WHEN "giftTier" = 'BLIND_BOX' THEN 'CUSTOMIZED' ELSE 'NORMAL' END
WHERE "category" = 'GIFTS';

-- Keep the existing canonical equipped slot when categories collide. Ownership
-- and artwork references are retained; otherwise migrate the most recent slot.
INSERT INTO "UserEquippedProp" ("userId", "category", "assetId", "equippedAt")
SELECT DISTINCT ON ("userId", CASE WHEN "category" = 'TAIL_LIGHTS' THEN 'ENTRANCES' ELSE 'BADGES' END)
  "userId", CASE WHEN "category" = 'TAIL_LIGHTS' THEN 'ENTRANCES' ELSE 'BADGES' END, "assetId", "equippedAt"
FROM "UserEquippedProp" WHERE "category" IN ('MEDALS','ROLE_ARTWORK','TAIL_LIGHTS')
ORDER BY "userId", CASE WHEN "category" = 'TAIL_LIGHTS' THEN 'ENTRANCES' ELSE 'BADGES' END, "equippedAt" DESC
ON CONFLICT ("userId", "category") DO NOTHING;
DELETE FROM "UserEquippedProp" WHERE "category" IN ('MEDALS','ROLE_ARTWORK','TAIL_LIGHTS');
UPDATE "UploadAsset" SET "category" = CASE WHEN "category" = 'TAIL_LIGHTS' THEN 'ENTRANCES' ELSE 'BADGES' END,
  "updatedAt" = CURRENT_TIMESTAMP WHERE "category" IN ('MEDALS','ROLE_ARTWORK','TAIL_LIGHTS');
