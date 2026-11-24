CREATE TABLE "CsRoomMessage" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "senderId" TEXT,
    "body" TEXT NOT NULL,
    "mentions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "clearedAt" TIMESTAMP(3),
    "clearedById" TEXT,
    CONSTRAINT "CsRoomMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CsRoomMessage_publicId_key" ON "CsRoomMessage"("publicId");
CREATE INDEX "CsRoomMessage_country_createdAt_idx" ON "CsRoomMessage"("country", "createdAt");
CREATE INDEX "CsRoomMessage_senderId_createdAt_idx" ON "CsRoomMessage"("senderId", "createdAt");
CREATE INDEX "CsRoomMessage_createdAt_idx" ON "CsRoomMessage"("createdAt");

ALTER TABLE "CsRoomMessage" ADD CONSTRAINT "CsRoomMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
