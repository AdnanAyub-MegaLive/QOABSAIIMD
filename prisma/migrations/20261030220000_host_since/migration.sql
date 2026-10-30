ALTER TABLE "User" ADD COLUMN "hostSince" TIMESTAMP(3);

-- Only dated evidence of hosting/membership is a valid historical start. Do not
-- confuse account creation or today's migration date with becoming a host.
WITH evidence AS (
  SELECT u.id AS "userId", s."createdAt" AS at_time
  FROM "GiftSettlement" s JOIN "GiftTransaction" g ON g.id=s."giftTransactionId"
  JOIN "User" u ON u.id=g."recipientUserId"
  WHERE s."recipientType"='HOST'
  UNION ALL
  SELECT u.id, s."createdAt" FROM "GiftSettlement" s
  JOIN "GiftTransaction" g ON g.id=s."giftTransactionId"
  JOIN "Talent" t ON t.id=g."talentId" JOIN "User" u ON u."publicId"=t."publicId"
  WHERE s."recipientType"='HOST' AND g."recipientUserId" IS NULL
  UNION ALL
  SELECT "userId", COALESCE("reviewedAt","updatedAt","createdAt") FROM "AgencyJoinRequest" WHERE status='APPROVED'
), first_host AS (SELECT "userId", MIN(at_time) AS at_time FROM evidence GROUP BY "userId")
UPDATE "User" u SET "hostSince"=h.at_time FROM first_host h WHERE h."userId"=u.id AND h.at_time<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE FUNCTION stamp_host_since() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at_time TIMESTAMP(3) := clock_timestamp() AT TIME ZONE 'UTC';
        host_now BOOLEAN := 'HOST'=ANY(NEW."appRoles") OR NEW.role::text='HOST';
BEGIN
  IF TG_OP='INSERT' THEN
    IF host_now THEN NEW."hostSince"=LEAST(COALESCE(NEW."hostSince",at_time),at_time); END IF;
  ELSIF OLD."hostSince" IS NOT NULL THEN
    -- Removal, rejoining and ordinary profile edits never erase/reset first tenure.
    NEW."hostSince"=OLD."hostSince";
  ELSIF host_now AND (
    NOT ('HOST'=ANY(OLD."appRoles") OR OLD.role::text='HOST') OR
    (NEW."agencyId" IS NOT NULL AND NEW."agencyId" IS DISTINCT FROM OLD."agencyId")
  ) THEN
    NEW."hostSince"=at_time;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_host_since BEFORE INSERT OR UPDATE OF "appRoles", role, "agencyId", "hostSince" ON "User" FOR EACH ROW EXECUTE FUNCTION stamp_host_since();
