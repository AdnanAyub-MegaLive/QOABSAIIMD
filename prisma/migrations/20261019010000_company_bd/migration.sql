ALTER TABLE "User" ADD COLUMN "companyBdCountry" TEXT;
CREATE UNIQUE INDEX "User_companyBdCountry_key" ON "User"("companyBdCountry");
-- New system accounts only; no existing balances, salary records or agency links are backfilled.
INSERT INTO "User" (id,"publicId",name,country,"companyBdCountry","appRoles","isOfficial","updatedAt")
SELECT 'company-bd-'||lower(code),'COMPANY-BD-'||code,'Official Company BD · '||code,code,code,ARRAY['BD']::"ApplicationRole"[],true,NOW()
FROM unnest(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',' ')) AS code;

CREATE FUNCTION protect_company_bd() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."companyBdCountry" IS NOT NULL THEN RAISE EXCEPTION 'Company BD cannot be deleted'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD."companyBdCountry" IS NOT NULL AND NEW."companyBdCountry" IS DISTINCT FROM OLD."companyBdCountry" THEN RAISE EXCEPTION 'Company identity is immutable'; END IF;
 IF NEW."companyBdCountry" IS NOT NULL AND (NEW."supervisorUserId" IS NOT NULL OR NEW."teamRole" IS NOT NULL OR NEW.country IS DISTINCT FROM NEW."companyBdCountry" OR NEW."appRoles" IS DISTINCT FROM ARRAY['BD']::"ApplicationRole"[] OR NEW.status<>'ACTIVE' OR NEW."deletedAt" IS NOT NULL OR NEW."passwordHash" IS NOT NULL OR NEW."googleSubject" IS NOT NULL OR NEW.phone IS NOT NULL OR NEW.email IS NOT NULL OR NEW."isOfficial" IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Official Company BD belongs only to the Company and cannot sign in';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_company_bd BEFORE INSERT OR UPDATE OR DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION protect_company_bd();

-- Cover every agency unlink path, including legacy portal actions and FK deletion.
CREATE FUNCTION company_agency_fallback() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id TEXT;
BEGIN
 IF OLD."bdUserId" IS NOT NULL AND NEW."bdUserId" IS NULL THEN
  SELECT id INTO target_id FROM "User" WHERE "companyBdCountry"=upper(NEW.country);
  IF target_id IS NULL THEN RAISE EXCEPTION 'Agency needs a valid country for Company BD reassignment'; END IF;
  NEW."bdUserId":=target_id;
  INSERT INTO "AuditLog" (id,action,category,"entityType","entityId",description,metadata)
  VALUES ('company-fallback-'||gen_random_uuid()::text,'AGENCY_COMPANY_FALLBACK','AGENCY_MANAGEMENT','Agency',NEW."publicId",'Agency returned to its country Official Company BD.',jsonb_build_object('previousBdUserId',OLD."bdUserId",'bdUserId',target_id,'country',NEW.country));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER company_agency_fallback BEFORE UPDATE OF "bdUserId" ON "Agency" FOR EACH ROW EXECUTE FUNCTION company_agency_fallback();

-- Detachment/role loss rehomes agencies in the same transaction as the user change.
CREATE FUNCTION detached_bd_agencies() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."companyBdCountry" IS NULL AND ((OLD."supervisorUserId" IS NOT NULL AND NEW."supervisorUserId" IS NULL) OR ('BD'=ANY(OLD."appRoles") AND NOT ('BD'=ANY(NEW."appRoles"))) OR (OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL)) THEN
  UPDATE "Agency" SET "bdUserId"=NULL WHERE "bdUserId"=OLD.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER detached_bd_agencies AFTER UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION detached_bd_agencies();
