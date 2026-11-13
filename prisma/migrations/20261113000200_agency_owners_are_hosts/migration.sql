-- Correct existing active owners without changing their identity, KYC or other
-- roles. Preserve an existing hosting membership; otherwise use their earliest
-- active owned agency. The hostSince trigger records new eligibility now.
WITH owned AS (
  SELECT DISTINCT ON ("ownerUserId") "ownerUserId", id
  FROM "Agency"
  WHERE "ownerUserId" IS NOT NULL AND status='ACTIVE'
  ORDER BY "ownerUserId", "createdAt", id
)
UPDATE "User" u SET
  "appRoles" = CASE WHEN 'HOST'::"ApplicationRole"=ANY(u."appRoles") THEN u."appRoles"
    ELSE array_append(u."appRoles", 'HOST'::"ApplicationRole") END,
  "agencyId" = COALESCE(u."agencyId", owned.id),
  "updatedAt" = CURRENT_TIMESTAMP
FROM owned
WHERE u.id=owned."ownerUserId" AND u.status='ACTIVE' AND u."deletedAt" IS NULL
  AND u."companyBdCountry" IS NULL
  AND (NOT ('HOST'::"ApplicationRole"=ANY(u."appRoles")) OR u."agencyId" IS NULL);
