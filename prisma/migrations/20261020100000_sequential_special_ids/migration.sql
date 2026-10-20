ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'SPECIAL_ID_PURCHASE';
ALTER TABLE "SpecialIdDefinition" ADD COLUMN "coinPrice" BIGINT, ADD COLUMN "storeVisible" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "SpecialIdPurchase" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL, "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SpecialIdPurchase_userId_requestKey_key" ON "SpecialIdPurchase" ("userId","requestKey");
CREATE TABLE "PublicNumberReservation" ("number" TEXT PRIMARY KEY, "kind" TEXT NOT NULL);
-- Preserve existing identities. Reservation records never expire or get deleted.
INSERT INTO "PublicNumberReservation" SELECT substring("publicId" from '[0-9]{7}$'), 'NORMAL' FROM "User" WHERE "publicId" ~ '^(USR|TLN)-[0-9]{7}$' ON CONFLICT DO NOTHING;
INSERT INTO "PublicNumberReservation" SELECT substring("publicId" from '[0-9]{7}$'), 'NORMAL' FROM "Talent" WHERE "publicId" ~ '^TLN-[0-9]{7}$' ON CONFLICT DO NOTHING;
INSERT INTO "PublicNumberReservation" SELECT "code", 'SPECIAL' FROM "SpecialIdDefinition" WHERE "code" ~ '^[0-9]{7}$' ON CONFLICT DO NOTHING;
INSERT INTO "PublicNumberReservation" SELECT "specialId", 'SPECIAL' FROM "SpecialIdAssignment" WHERE "specialId" ~ '^[0-9]{7}$' ON CONFLICT DO NOTHING;
CREATE SEQUENCE user_public_number START 2030140 MAXVALUE 9999999 NO CYCLE;
CREATE SEQUENCE agency_public_number START 10200 MAXVALUE 99999 NO CYCLE;

CREATE FUNCTION reserve_special_number() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE existing TEXT;
BEGIN
  IF NEW."code" !~ '^[0-9]{7}$' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(2030140);
  SELECT kind INTO existing FROM "PublicNumberReservation" WHERE number=NEW."code";
  IF existing='NORMAL' THEN RAISE EXCEPTION 'SPECIAL_ID_CONFLICTS_WITH_NORMAL_ID'; END IF;
  INSERT INTO "PublicNumberReservation" VALUES (NEW."code",'SPECIAL') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER reserve_special_number BEFORE INSERT OR UPDATE OF code ON "SpecialIdDefinition" FOR EACH ROW EXECUTE FUNCTION reserve_special_number();

CREATE FUNCTION guard_special_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(2030140);
  IF NEW.status<>'ACTIVE' OR NEW."revokedAt" IS NOT NULL OR (NEW."expiresAt" IS NOT NULL AND NEW."expiresAt"<=CURRENT_TIMESTAMP) THEN RETURN NEW; END IF;
  IF NEW."specialId" ~ '^[0-9]{7}$' THEN
    IF EXISTS (SELECT 1 FROM "PublicNumberReservation" WHERE number=NEW."specialId" AND kind='NORMAL') THEN
      RAISE EXCEPTION 'SPECIAL_ID_CONFLICTS_WITH_NORMAL_ID';
    END IF;
    INSERT INTO "PublicNumberReservation" VALUES (NEW."specialId",'SPECIAL') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.status='ACTIVE' AND NEW."revokedAt" IS NULL AND (NEW."expiresAt" IS NULL OR NEW."expiresAt">CURRENT_TIMESTAMP) AND EXISTS (
    SELECT 1 FROM "SpecialIdAssignment" WHERE id<>NEW.id AND "specialId"=NEW."specialId"
      AND status='ACTIVE' AND "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP)
  ) THEN RAISE EXCEPTION 'SPECIAL_ID_ALREADY_ASSIGNED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_special_assignment BEFORE INSERT OR UPDATE OF "specialId",status,"revokedAt","expiresAt" ON "SpecialIdAssignment" FOR EACH ROW EXECUTE FUNCTION guard_special_assignment();

CREATE FUNCTION guard_normal_number() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n TEXT;
BEGIN
  IF NEW."publicId" !~ '^(USR|TLN)-[0-9]{7}$' THEN RETURN NEW; END IF;
  n := substring(NEW."publicId" from '[0-9]{7}$');
  IF TG_OP='UPDATE' AND substring(OLD."publicId" from '[0-9]{7}$')=n THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(2030140);
  IF EXISTS (SELECT 1 FROM "PublicNumberReservation" WHERE number=n AND kind='SPECIAL') THEN
    RAISE EXCEPTION 'NORMAL_ID_RESERVED_AS_SPECIAL';
  END IF;
  IF TG_TABLE_NAME='User' AND EXISTS (SELECT 1 FROM "User" WHERE id<>NEW.id AND "publicId" IN ('USR-'||n,'TLN-'||n)) THEN
    RAISE EXCEPTION 'NORMAL_ID_ALREADY_USED';
  END IF;
  INSERT INTO "PublicNumberReservation" VALUES(n,'NORMAL') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_normal_number BEFORE INSERT OR UPDATE OF "publicId" ON "User" FOR EACH ROW EXECUTE FUNCTION guard_normal_number();
CREATE TRIGGER guard_normal_number BEFORE INSERT OR UPDATE OF "publicId" ON "Talent" FOR EACH ROW EXECUTE FUNCTION guard_normal_number();

CREATE FUNCTION allocate_public_number(prefix TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n TEXT;
BEGIN
  IF prefix='AGN' THEN
    LOOP
      n := nextval('agency_public_number')::TEXT;
      IF NOT EXISTS (SELECT 1 FROM "Agency" WHERE "publicId"='AGN-'||n) THEN RETURN n; END IF;
    END LOOP;
  END IF;
  IF prefix NOT IN ('USR','TLN') THEN RAISE EXCEPTION 'INVALID_PUBLIC_ID_PREFIX'; END IF;
  PERFORM pg_advisory_xact_lock(2030140);
  LOOP
    n := nextval('user_public_number')::TEXT;
    IF EXISTS (SELECT 1 FROM "PublicNumberReservation" WHERE number=n) THEN CONTINUE; END IF;
    IF right(n,3)='804' OR n ~ '([0-9])\1\1' THEN
      INSERT INTO "SpecialIdDefinition" ("id","code","defaultDurationMinutes","updatedAt")
      VALUES ('AUTO-'||n,n,43200,CURRENT_TIMESTAMP) ON CONFLICT ("code") DO NOTHING;
      CONTINUE;
    END IF;
    INSERT INTO "PublicNumberReservation" VALUES (n,'NORMAL');
    RETURN n;
  END LOOP;
END $$;
