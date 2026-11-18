CREATE TABLE "CsRoomQueue" (
    "userId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CsRoomQueue_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "CsRoomQueue_country_joinedAt_idx" ON "CsRoomQueue"("country", "joinedAt");
