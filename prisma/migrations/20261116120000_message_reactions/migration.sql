CREATE TABLE "MessageReaction" (
 "messageId" TEXT NOT NULL REFERENCES "Message"(id) ON DELETE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 emoji VARCHAR(64) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("messageId","userId",emoji)
);
CREATE INDEX "MessageReaction_userId_idx" ON "MessageReaction"("userId");
