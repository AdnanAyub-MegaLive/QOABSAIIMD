ALTER TABLE "RedEnvelope" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "RedEnvelope_senderId_requestId_key" ON "RedEnvelope"("senderId", "requestId");
