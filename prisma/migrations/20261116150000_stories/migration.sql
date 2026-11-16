-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mediaKey" TEXT,
    "mediaMime" TEXT,
    "durationMs" INTEGER,
    "caption" TEXT NOT NULL DEFAULT '',
    "background" TEXT NOT NULL DEFAULT '#32104F',
    "audience" TEXT NOT NULL DEFAULT 'PUBLIC',
    "status" "PostReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewReason" TEXT,
    "reviewRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryView" (
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("storyId","userId")
);

-- CreateTable
CREATE TABLE "StoryCloseFriend" (
    "ownerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "StoryCloseFriend_pkey" PRIMARY KEY ("ownerId","memberId")
);

-- CreateTable
CREATE TABLE "StoryReport" (
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryReport_pkey" PRIMARY KEY ("storyId","userId")
);

-- CreateTable
CREATE TABLE "StoryMediaObject" (
    "key" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryMediaObject_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Story_publicId_key" ON "Story"("publicId");

-- CreateIndex
CREATE INDEX "Story_authorId_expiresAt_idx" ON "Story"("authorId", "expiresAt");

-- CreateIndex
CREATE INDEX "Story_status_createdAt_idx" ON "Story"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Story_authorId_requestId_key" ON "Story"("authorId", "requestId");

-- CreateIndex
CREATE INDEX "StoryMediaObject_expiresAt_idx" ON "StoryMediaObject"("expiresAt");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCloseFriend" ADD CONSTRAINT "StoryCloseFriend_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCloseFriend" ADD CONSTRAINT "StoryCloseFriend_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReport" ADD CONSTRAINT "StoryReport_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReport" ADD CONSTRAINT "StoryReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

