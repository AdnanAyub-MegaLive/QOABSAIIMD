ALTER TABLE "Agency" ADD COLUMN "logoAssetPublicId" TEXT, ADD COLUMN "badgeAssetPublicId" TEXT, ADD COLUMN "level" INTEGER NOT NULL DEFAULT 0 CHECK ("level" >= 0);
ALTER TABLE "GiftTransaction" ADD COLUMN "reversedAt" TIMESTAMP(3);
CREATE TABLE "RoleBadge" ("code" TEXT PRIMARY KEY, "label" TEXT NOT NULL, "assetPublicId" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "UserMedal" (
 "id" TEXT PRIMARY KEY, "publicId" TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "assetPublicId" TEXT NOT NULL, "name" TEXT NOT NULL, "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "pinned" BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX "UserMedal_userId_pinned_earnedAt_id_idx" ON "UserMedal"("userId", "pinned", "earnedAt", "id");
CREATE TABLE "ProfileRelationship" (
 "id" TEXT PRIMARY KEY, "publicId" TEXT NOT NULL UNIQUE,
 "leftUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "rightUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "type" TEXT NOT NULL CHECK ("type" IN ('CP','BFF','BRO','SIS')), "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','ACTIVE','REJECTED','REMOVED','EXPIRED')),
 "leftAcceptedAt" TIMESTAMP(3), "rightAcceptedAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "level" INTEGER NOT NULL DEFAULT 0 CHECK ("level" >= 0),
 CHECK ("leftUserId" < "rightUserId"),
 CHECK ("status" <> 'ACTIVE' OR ("leftAcceptedAt" IS NOT NULL AND "rightAcceptedAt" IS NOT NULL AND "startedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "ProfileRelationship_leftUserId_rightUserId_type_key" ON "ProfileRelationship"("leftUserId", "rightUserId", "type");
CREATE INDEX "ProfileRelationship_leftUserId_status_idx" ON "ProfileRelationship"("leftUserId", "status");
CREATE INDEX "ProfileRelationship_rightUserId_status_idx" ON "ProfileRelationship"("rightUserId", "status");
