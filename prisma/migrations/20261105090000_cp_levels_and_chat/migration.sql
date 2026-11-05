ALTER TABLE "ProfileRelationship" ADD COLUMN "exp" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Message" ADD COLUMN "metadata" JSONB;
CREATE TABLE "CpLevel" (
 "level" INTEGER PRIMARY KEY CHECK ("level" > 0), "name" TEXT NOT NULL,
 "minExp" BIGINT NOT NULL CHECK ("minExp" >= 0), "badgeUrl" TEXT,
 "fullAnimationUrl" TEXT, "fullAnimationMimeType" TEXT,
 "seatEffect" TEXT NOT NULL, "seatColor" TEXT,
 "rewards" JSONB NOT NULL DEFAULT '[]', "enabled" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "CpGiftExperience" (
 "giftId" TEXT PRIMARY KEY REFERENCES "GiftTransaction"("id") ON DELETE RESTRICT,
 "relationshipId" TEXT NOT NULL REFERENCES "ProfileRelationship"("id") ON DELETE RESTRICT,
 "amount" BIGINT NOT NULL CHECK ("amount" > 0), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CpGiftExperience_relationshipId_idx" ON "CpGiftExperience"("relationshipId");
CREATE TABLE "CpLevelClaim" (
 "relationshipId" TEXT NOT NULL REFERENCES "ProfileRelationship"("id") ON DELETE RESTRICT,
 "level" INTEGER NOT NULL REFERENCES "CpLevel"("level") ON DELETE RESTRICT,
 "rewards" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("relationshipId", "level")
);
INSERT INTO "CpLevel" ("level", "name", "minExp", "seatEffect")
SELECT n, 'CP ' || n, 0, 'WAVE_' || n FROM generate_series(1,5) n;
