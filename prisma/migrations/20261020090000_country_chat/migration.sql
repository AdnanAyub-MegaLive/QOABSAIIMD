ALTER TABLE "Message" ADD COLUMN "senderCountry" VARCHAR(2);
CREATE INDEX "Message_conversationId_senderCountry_createdAt_id_idx" ON "Message"("conversationId","senderCountry","createdAt","id");
-- Historical WORLD messages have no trustworthy country-at-send snapshot.
-- Leave them NULL; they are not exposed in Country Chat.
