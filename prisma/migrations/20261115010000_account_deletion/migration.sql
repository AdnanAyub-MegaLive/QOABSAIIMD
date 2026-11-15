CREATE TABLE "AccountDeletionRequest" (
 "id" TEXT PRIMARY KEY, "userId" TEXT UNIQUE, "status" TEXT NOT NULL DEFAULT 'QUEUED', "source" TEXT NOT NULL,
 "verifiedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0, "lastError" TEXT, "scope" JSONB
);
CREATE INDEX "AccountDeletionRequest_status_createdAt_idx" ON "AccountDeletionRequest"("status", "createdAt");
CREATE TABLE "AccountDeletionObject" (
 "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL, "kind" TEXT NOT NULL, "key" TEXT NOT NULL, "completedAt" TIMESTAMP(3),
 UNIQUE("requestId", "kind", "key")
);
CREATE INDEX "AccountDeletionObject_requestId_completedAt_idx" ON "AccountDeletionObject"("requestId", "completedAt");

-- Prevent delayed rewards, webhooks or administrator edits from reviving an
-- already erased identity. Queued requests keep their original ID while pending
-- financial settlements are reconciled. Other accounts are unaffected.
CREATE FUNCTION prevent_erased_account_revival() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."deletedAt" IS NOT NULL AND OLD."publicId" LIKE 'DELETED-%' AND
     (NEW."publicId" <> OLD."publicId" OR NEW."deletedAt" IS NULL OR NEW.status <> 'BANNED'
      OR NEW.name <> 'Deleted User' OR NEW.email IS NOT NULL OR NEW.phone IS NOT NULL
      OR NEW."googleSubject" IS NOT NULL OR NEW."googleEmail" IS NOT NULL
      OR NEW."passwordHash" IS NOT NULL OR NEW."profileImage" IS NOT NULL
      OR NEW."signupDeviceId" IS NOT NULL OR NEW.bio IS NOT NULL OR NEW.dob IS NOT NULL
      OR NEW."coinBalance" <> 0 OR NEW."resellerCoinBalance" <> 0
      OR NEW."hostSalaryCoinBalance" <> 0 OR NEW."couponBalance" <> 0) THEN
    RAISE EXCEPTION 'ACCOUNT_ERASED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_erased_account_revival BEFORE UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION prevent_erased_account_revival();
