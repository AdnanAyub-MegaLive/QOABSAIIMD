CREATE TABLE "CsRoomInvite" (
    "userId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CsRoomInvite_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "CsRoomInvite_country_idx" ON "CsRoomInvite"("country");
