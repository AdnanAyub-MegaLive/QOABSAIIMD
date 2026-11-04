BEGIN;
CREATE TABLE "RoomRocketPendingGift" (
  "seq" BIGSERIAL PRIMARY KEY,
  "giftId" TEXT NOT NULL UNIQUE,
  "campaignId" TEXT NOT NULL
);
ALTER TABLE "RoomRocketProgress" DROP CONSTRAINT "RoomRocketProgress_pkey",
  ADD PRIMARY KEY ("campaignId","roomId");
COMMIT;
