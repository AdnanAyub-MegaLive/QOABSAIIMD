CREATE TABLE "MessageReceipt" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "MessageReceipt_pkey" PRIMARY KEY ("messageId", "userId")
);

CREATE INDEX "MessageReceipt_userId_deliveredAt_idx"
ON "MessageReceipt"("userId", "deliveredAt");

CREATE INDEX "MessageReceipt_userId_readAt_idx"
ON "MessageReceipt"("userId", "readAt");

-- Preserve the effective read state that existed before receipts were introduced.
-- A receipt is needed for every non-sender participant, including historical messages,
-- otherwise an old message could never be acknowledged after this deployment.
INSERT INTO "MessageReceipt" ("messageId", "userId", "deliveredAt", "readAt")
SELECT
    "Message"."id",
    "ConversationParticipant"."userId",
    CASE
        WHEN "ConversationParticipant"."lastReadAt" IS NOT NULL
          AND "Message"."createdAt" <= "ConversationParticipant"."lastReadAt"
        THEN "ConversationParticipant"."lastReadAt"
        ELSE NULL
    END,
    CASE
        WHEN "ConversationParticipant"."lastReadAt" IS NOT NULL
          AND "Message"."createdAt" <= "ConversationParticipant"."lastReadAt"
        THEN "ConversationParticipant"."lastReadAt"
        ELSE NULL
    END
FROM "Message"
INNER JOIN "ConversationParticipant"
    ON "ConversationParticipant"."conversationId" = "Message"."conversationId"
WHERE "ConversationParticipant"."userId" <> "Message"."senderId"
ON CONFLICT ("messageId", "userId") DO NOTHING;

ALTER TABLE "MessageReceipt"
ADD CONSTRAINT "MessageReceipt_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageReceipt"
ADD CONSTRAINT "MessageReceipt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
