CREATE TABLE "ProfileCoverItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
 "imageData" BYTEA NOT NULL, "mimeType" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "revision" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ProfileCoverItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProfileCoverItem_userId_createdAt_idx" ON "ProfileCoverItem"("userId","createdAt");
