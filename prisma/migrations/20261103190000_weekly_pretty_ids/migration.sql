-- Additive only: no historic grants, wallets or recharge records are changed.
ALTER TABLE "PrettyIdGrant" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
 ADD COLUMN "level" INTEGER, ADD COLUMN "maintenanceCoins" BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN "weekStart" TIMESTAMP(3);
CREATE UNIQUE INDEX "PrettyIdGrant_userId_weekStart_key" ON "PrettyIdGrant"("userId", "weekStart");
CREATE TABLE "PrettyIdPolicy" (
 "id" SERIAL PRIMARY KEY, "effectiveFrom" TIMESTAMP(3) NOT NULL UNIQUE,
 "enabled" BOOLEAN NOT NULL DEFAULT false, "levels" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PrettyIdWeek" (
 "start" TIMESTAMP(3) PRIMARY KEY, "cursor" TEXT NOT NULL DEFAULT '', "completedAt" TIMESTAMP(3)
);
CREATE TABLE "PrettyIdMaintenance" (
 "id" TEXT PRIMARY KEY, "grantId" TEXT NOT NULL REFERENCES "PrettyIdGrant"("id") ON DELETE CASCADE,
 "weekStart" TIMESTAMP(3) NOT NULL, "accepted" BOOLEAN NOT NULL, "coins" BIGINT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("grantId", "weekStart")
);
CREATE INDEX "PrettyIdMaintenance_weekStart_idx" ON "PrettyIdMaintenance"("weekStart");

-- Inactive owned IDs and unactivated claims remain reserved too.
CREATE OR REPLACE FUNCTION guard_special_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(2030140);
 IF NEW.status NOT IN ('ACTIVE','OWNED','CLAIMED') OR NEW."revokedAt" IS NOT NULL
    OR (NEW."expiresAt" IS NOT NULL AND NEW."expiresAt"<=CURRENT_TIMESTAMP) THEN RETURN NEW; END IF;
 IF NEW."specialId" ~ '^[0-9]{7}$' THEN
  IF EXISTS (SELECT 1 FROM "PublicNumberReservation" WHERE number=NEW."specialId" AND kind='NORMAL') THEN
   RAISE EXCEPTION 'SPECIAL_ID_CONFLICTS_WITH_NORMAL_ID';
  END IF;
  INSERT INTO "PublicNumberReservation" VALUES (NEW."specialId",'SPECIAL') ON CONFLICT DO NOTHING;
 END IF;
 IF EXISTS (SELECT 1 FROM "SpecialIdAssignment" WHERE id<>NEW.id
   AND upper("specialId")=upper(NEW."specialId") AND status IN ('ACTIVE','OWNED','CLAIMED')
   AND "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP)) THEN
  RAISE EXCEPTION 'SPECIAL_ID_ALREADY_ASSIGNED';
 END IF;
 RETURN NEW;
END $$;
