CREATE TABLE "FriendRequest" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "pairKey" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "addresseeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FriendRequest_publicId_key" ON "FriendRequest"("publicId");
CREATE UNIQUE INDEX "FriendRequest_pairKey_key" ON "FriendRequest"("pairKey");
CREATE UNIQUE INDEX "FriendRequest_requesterId_addresseeId_key"
  ON "FriendRequest"("requesterId", "addresseeId");
CREATE INDEX "FriendRequest_addresseeId_status_createdAt_idx"
  ON "FriendRequest"("addresseeId", "status", "createdAt");
CREATE INDEX "FriendRequest_requesterId_status_createdAt_idx"
  ON "FriendRequest"("requesterId", "status", "createdAt");

ALTER TABLE "FriendRequest"
  ADD CONSTRAINT "FriendRequest_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FriendRequest"
  ADD CONSTRAINT "FriendRequest_addresseeId_fkey"
  FOREIGN KEY ("addresseeId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
