-- Prospective policy change only: preserve historical rule versions, points,
-- financial balances and ledgers. Clone each active/in-use configuration.
DO $$
DECLARE old_config RECORD; new_version INTEGER;
BEGIN
  FOR old_config IN
    SELECT c.* FROM "ProgressionConfiguration" c
    WHERE (c.active OR EXISTS (SELECT 1 FROM "UserProgress" p WHERE p."configurationVersion" = c.version))
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.rules) r WHERE r->>'allowSelf' IS DISTINCT FROM 'true')
  LOOP
    UPDATE "ProgressionConfiguration" SET active = false WHERE version = old_config.version;
    INSERT INTO "ProgressionConfiguration" (enabled, active, rules)
      VALUES (old_config.enabled, old_config.active,
        (SELECT jsonb_agg(r || '{"allowSelf":true}'::jsonb ORDER BY ord)
         FROM jsonb_array_elements(old_config.rules) WITH ORDINALITY AS entries(r, ord)))
      RETURNING version INTO new_version;
    INSERT INTO "LevelDefinition" (id, track, "configurationVersion", level, "thresholdPoints", "badgeAssetId", benefits)
      SELECT 'self-gift-' || new_version || '-' || track || '-' || level,
        track, new_version, level, "thresholdPoints", "badgeAssetId", benefits
      FROM "LevelDefinition" WHERE "configurationVersion" = old_config.version;
    UPDATE "UserProgress" SET "configurationVersion" = new_version,
      revision = revision + 1, "updatedAt" = NOW()
      WHERE "configurationVersion" = old_config.version;
  END LOOP;
END $$;
