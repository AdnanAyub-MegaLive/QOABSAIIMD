CREATE TABLE "Post" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "description" TEXT,
  "imageUrl" TEXT,
  "imageData" BYTEA,
  "imageMime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Post_publicId_key" ON "Post"("publicId");
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");
CREATE INDEX "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
