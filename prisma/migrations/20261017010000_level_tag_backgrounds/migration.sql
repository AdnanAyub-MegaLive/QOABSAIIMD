CREATE TABLE "LevelTagBackground" (
 "track" TEXT NOT NULL, "level" INTEGER NOT NULL, "assetId" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "LevelTagBackground_pkey" PRIMARY KEY ("track", "level"),
 CONSTRAINT "LevelTagBackground_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "UploadAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "LevelTagBackground_track_check" CHECK ("track" IN ('USER','CHARM','GAME','AGENCY')),
 CONSTRAINT "LevelTagBackground_level_check" CHECK ("level" >= 0)
);
