CREATE TABLE "UserAvatarHistory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "imageUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "UserAvatarHistory_userId_createdAt_idx" ON "UserAvatarHistory"("userId", "createdAt");
CREATE TABLE "UserProfileSettings" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  "avatarHistoryLimit" INTEGER NOT NULL DEFAULT 20 CHECK ("avatarHistoryLimit" BETWEEN 1 AND 20)
);
INSERT INTO "UserProfileSettings" ("id") VALUES ('default');
