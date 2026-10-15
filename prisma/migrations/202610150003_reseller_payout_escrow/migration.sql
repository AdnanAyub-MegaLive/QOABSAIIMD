CREATE TABLE "ResellerPayout" (
 "id" TEXT PRIMARY KEY, "senderId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "resellerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "diamonds" BIGINT NOT NULL CHECK ("diamonds">0),
 "quote" JSONB NOT NULL, "policyVersion" INTEGER NOT NULL, "hostSource" BOOLEAN NOT NULL DEFAULT false,
 "country" TEXT NOT NULL, "bankCipher" TEXT NOT NULL, "maskedBank" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','AWAITING_HOST','SUPPORT_REVIEW','COMPLETED','CANCELLED')),
 "paymentDays" INTEGER CHECK ("paymentDays" IN (1,3,5)), "paymentDueAt" TIMESTAMP(3) NOT NULL,
 "proofData" BYTEA, "proofMimeType" TEXT, "proofUploadedAt" TIMESTAMP(3), "proofSubmittedAt" TIMESTAMP(3),
 "verifyDueAt" TIMESTAMP(3), "paymentReference" TEXT, "reviewReason" TEXT,
 "completedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ResellerPayout_senderId_requestKey_key" ON "ResellerPayout"("senderId","requestKey");
CREATE INDEX "ResellerPayout_status_paymentDueAt_idx" ON "ResellerPayout"("status","paymentDueAt");
CREATE INDEX "ResellerPayout_status_verifyDueAt_idx" ON "ResellerPayout"("status","verifyDueAt");
CREATE INDEX "ResellerPayout_resellerId_createdAt_id_idx" ON "ResellerPayout"("resellerId","createdAt","id");
CREATE INDEX "ResellerPayout_senderId_createdAt_id_idx" ON "ResellerPayout"("senderId","createdAt","id");
