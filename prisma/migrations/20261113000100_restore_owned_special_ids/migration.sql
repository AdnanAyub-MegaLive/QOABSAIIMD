-- Repair only still-valid replacement records. Explicit REVOKED rows stay revoked.
-- Preserve existing holders and normal-ID reservations; never extend an expired ID.
DO $$
DECLARE candidate RECORD; holder RECORD; next_id RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(2030140);
  FOR candidate IN SELECT * FROM "SpecialIdAssignment"
    WHERE status='REPLACED' AND "revokedAt" IS NOT NULL
      AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP)
    ORDER BY "expiresAt" DESC NULLS FIRST, id
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "SpecialIdAssignment" a WHERE a.id<>candidate.id
      AND (upper(a."specialId")=upper(candidate."specialId") OR a."definitionId"=candidate."definitionId")
      AND a.status IN ('ACTIVE','OWNED','CLAIMED') AND a."revokedAt" IS NULL
      AND (a."expiresAt" IS NULL OR a."expiresAt">CURRENT_TIMESTAMP))
      AND NOT EXISTS (SELECT 1 FROM "PublicNumberReservation" WHERE number=candidate."specialId" AND kind='NORMAL')
    THEN
      PERFORM id FROM "User" WHERE id=candidate."userId" FOR UPDATE;
      UPDATE "SpecialIdAssignment" SET status='OWNED', "revokedAt"=NULL WHERE id=candidate.id;
    END IF;
  END LOOP;

  UPDATE "SpecialIdAssignment" SET status='EXPIRED'
    WHERE status IN ('ACTIVE','OWNED','CLAIMED') AND "expiresAt"<=CURRENT_TIMESTAMP;
  FOR holder IN SELECT DISTINCT a."userId" FROM "SpecialIdAssignment" a
    WHERE a.status IN ('OWNED','CLAIMED') AND a."revokedAt" IS NULL
      AND a."startsAt"<=CURRENT_TIMESTAMP AND (a."expiresAt" IS NULL OR a."expiresAt">CURRENT_TIMESTAMP)
      AND NOT EXISTS (SELECT 1 FROM "SpecialIdAssignment" active WHERE active."userId"=a."userId"
        AND active.status='ACTIVE' AND active."revokedAt" IS NULL AND active."startsAt"<=CURRENT_TIMESTAMP
        AND (active."expiresAt" IS NULL OR active."expiresAt">CURRENT_TIMESTAMP))
  LOOP
    PERFORM id FROM "User" WHERE id=holder."userId" FOR UPDATE;
    SELECT a.*, COALESCE(g."durationMinutes", d."defaultDurationMinutes") AS duration INTO next_id
      FROM "SpecialIdAssignment" a
      LEFT JOIN "PrettyIdGrant" g ON g."assignmentId"=a.id
      LEFT JOIN "SpecialIdDefinition" d ON d.id=a."definitionId"
      WHERE a."userId"=holder."userId" AND a.status IN ('OWNED','CLAIMED')
        AND a."revokedAt" IS NULL AND a."startsAt"<=CURRENT_TIMESTAMP
        AND (a."expiresAt" IS NULL OR a."expiresAt">CURRENT_TIMESTAMP)
        AND NOT EXISTS (SELECT 1 FROM "SpecialIdAssignment" other WHERE other.id<>a.id
          AND (upper(other."specialId")=upper(a."specialId") OR other."definitionId"=a."definitionId")
          AND other.status IN ('ACTIVE','OWNED','CLAIMED') AND other."revokedAt" IS NULL
          AND (other."expiresAt" IS NULL OR other."expiresAt">CURRENT_TIMESTAMP))
      ORDER BY a."expiresAt" DESC NULLS FIRST, a.id LIMIT 1;
    IF FOUND THEN
      UPDATE "SpecialIdAssignment" SET status='ACTIVE',
        "startsAt"=CASE WHEN next_id.status='CLAIMED' AND next_id."expiresAt" IS NULL AND next_id.duration IS NOT NULL THEN CURRENT_TIMESTAMP ELSE "startsAt" END,
        "expiresAt"=CASE WHEN next_id.status='CLAIMED' AND next_id."expiresAt" IS NULL AND next_id.duration IS NOT NULL THEN CURRENT_TIMESTAMP + next_id.duration * INTERVAL '1 minute' ELSE "expiresAt" END
        WHERE id=next_id.id;
    END IF;
  END LOOP;
END $$;
