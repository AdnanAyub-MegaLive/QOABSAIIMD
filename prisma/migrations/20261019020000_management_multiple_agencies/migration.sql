-- Structural change only: existing ownership, balances and salary records are unchanged.
DROP INDEX "Agency_ownerUserId_key";
CREATE INDEX "Agency_ownerUserId_idx" ON "Agency"("ownerUserId");

CREATE FUNCTION enforce_agency_owner_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE roles "ApplicationRole"[]; company TEXT;
BEGIN
 IF NEW."ownerUserId" IS NULL THEN RETURN NEW; END IF;
 SELECT "appRoles","companyBdCountry" INTO roles,company FROM "User" WHERE id=NEW."ownerUserId" FOR UPDATE;
 IF company IS NOT NULL THEN RAISE EXCEPTION 'COMPANY_BD_CANNOT_OWN_AGENCY'; END IF;
 IF NOT (roles && ARRAY['BD','ADMIN','JUNIOR_ADMIN','SENIOR_ADMIN','SUPER_ADMIN','COUNTRY_HEAD','MANAGER']::"ApplicationRole"[])
 AND EXISTS(SELECT 1 FROM "Agency" WHERE "ownerUserId"=NEW."ownerUserId" AND id<>NEW.id) THEN
  RAISE EXCEPTION 'AGENCY_OWNER_LIMIT_REACHED';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enforce_agency_owner_limit BEFORE INSERT OR UPDATE OF "ownerUserId" ON "Agency" FOR EACH ROW EXECUTE FUNCTION enforce_agency_owner_limit();

CREATE FUNCTION protect_multiple_agency_owner_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT (NEW."appRoles" && ARRAY['BD','ADMIN','JUNIOR_ADMIN','SENIOR_ADMIN','SUPER_ADMIN','COUNTRY_HEAD','MANAGER']::"ApplicationRole"[])
 AND (SELECT count(*) FROM "Agency" WHERE "ownerUserId"=NEW.id)>1 THEN
  RAISE EXCEPTION 'Reassign additional agencies before removing the final management role';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_multiple_agency_owner_role BEFORE UPDATE OF "appRoles" ON "User" FOR EACH ROW EXECUTE FUNCTION protect_multiple_agency_owner_role();

-- Direct agency supervisors may now hold any business management role.
-- Losing BD alone must not detach an otherwise eligible manager's agencies.
CREATE OR REPLACE FUNCTION detached_bd_agencies() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE management_roles "ApplicationRole"[] := ARRAY['BD','ADMIN','JUNIOR_ADMIN','SENIOR_ADMIN','SUPER_ADMIN','COUNTRY_HEAD','MANAGER']::"ApplicationRole"[];
BEGIN
 IF OLD."companyBdCountry" IS NULL AND (
   (OLD."supervisorUserId" IS NOT NULL AND NEW."supervisorUserId" IS NULL)
   OR ((OLD."appRoles" && management_roles) AND NOT (NEW."appRoles" && management_roles))
   OR (OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL)
 ) THEN
  UPDATE "Agency" SET "bdUserId"=NULL WHERE "bdUserId"=OLD.id;
 END IF;
 RETURN NEW;
END $$;
