-- Explicit prospective policy upgrade. Preserve old versions and ledger entries.
-- Only fill missing NORMAL_USER gift-XP rules from the matching HOST rule;
-- existing custom normal-user rules (including zero rates) remain unchanged.
DO $$ DECLARE old_config RECORD; new_version INTEGER; additions JSONB;
BEGIN
  FOR old_config IN SELECT * FROM "ProgressionConfiguration" WHERE enabled = true ORDER BY version LOOP
    SELECT jsonb_agg(rule || jsonb_build_object('recipientType','NORMAL_USER')) INTO additions
    FROM jsonb_array_elements(old_config.rules) rule
    WHERE rule->>'track'='CHARM' AND rule->>'recipientType'='HOST' AND rule->>'basis'='GIFT_XP'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(old_config.rules) existing
        WHERE existing->>'track'='CHARM' AND existing->>'recipientType'='NORMAL_USER' AND existing->>'source'=rule->>'source');
    IF additions IS NOT NULL THEN
      INSERT INTO "ProgressionConfiguration" (enabled, active, rules)
        VALUES (old_config.enabled, false, old_config.rules || additions) RETURNING version INTO new_version;
      INSERT INTO "LevelDefinition" (id,track,"configurationVersion",level,"thresholdPoints","badgeAssetId",benefits)
        SELECT 'charm-coverage-'||new_version||'-'||track||'-'||level,track,new_version,level,"thresholdPoints","badgeAssetId",benefits
        FROM "LevelDefinition" WHERE "configurationVersion"=old_config.version;
      UPDATE "UserProgress" SET "configurationVersion"=new_version, revision=revision+1,"updatedAt"=NOW() WHERE "configurationVersion"=old_config.version;
      IF old_config.active THEN
        UPDATE "ProgressionConfiguration" SET active=false WHERE version=old_config.version;
        UPDATE "ProgressionConfiguration" SET active=true WHERE version=new_version;
      END IF;
    END IF;
  END LOOP;
END $$;
