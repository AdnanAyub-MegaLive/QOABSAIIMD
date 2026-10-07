ALTER TABLE "UploadAsset" ADD COLUMN "senderXp" BIGINT NOT NULL DEFAULT 0, ADD COLUMN "receiverXp" BIGINT NOT NULL DEFAULT 0;
DO $$ DECLARE v INTEGER; BEGIN
  UPDATE "ProgressionConfiguration" SET active=false WHERE active=true;
  INSERT INTO "ProgressionConfiguration" (enabled,active,rules) VALUES (true,true,
    (SELECT jsonb_agg(jsonb_build_object('track',track,'source',source,'recipientType',CASE WHEN track='USER' THEN 'ANY' ELSE 'HOST' END,'basis','GIFT_XP','allowSelf',false,'numerator','1','denominator','1','description','Configured XP per gift, multiplied by quantity.')) FROM unnest(ARRAY['USER','CHARM']) track CROSS JOIN unnest(ARRAY['PAID','BACKPACK','LUCKY','BLIND_BOX']) source)) RETURNING version INTO v;
  INSERT INTO "LevelDefinition" (id,track,"configurationVersion",level,"thresholdPoints",benefits)
    SELECT 'gift-xp-'||v||'-'||track||'-'||level,track,v,level,level*900,'[]'::jsonb FROM unnest(ARRAY['USER','CHARM']) track CROSS JOIN generate_series(0,10) level;
  UPDATE "UserProgress" SET "configurationVersion"=v,"currentLevel"=LEAST(10,"lifetimePoints"/900)::integer,revision=revision+1,"updatedAt"=NOW();
END $$;
