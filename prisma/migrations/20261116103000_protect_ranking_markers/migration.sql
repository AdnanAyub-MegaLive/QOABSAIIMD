BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- These are infrastructure markers, not resettable ranking results.
-- Preserve existing revisions/timestamps and restore only missing markers.
CREATE FUNCTION ensure_ranking_markers() RETURNS integer
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE repaired integer; installed integer;
BEGIN
  SELECT count(*) INTO installed FROM pg_trigger
  WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND tgrelid IN (
    '"GiftTransaction"'::regclass, '"SharedGameEntry"'::regclass,
    '"User"'::regclass, '"UserBlock"'::regclass, '"Ban"'::regclass,
    '"GiftSettlement"'::regclass, '"GiftRecoverySnapshot"'::regclass, '"AuditLog"'::regclass
  ) AND tgname IN ('room_ranking_settlement','room_ranking_gift','room_ranking_game',
    'room_ranking_user_visibility','room_ranking_blocks','room_ranking_bans',
    'hourly_gift_ranking_gifts','hourly_gift_ranking_settlements',
    'hourly_gift_ranking_recovery','hourly_gift_ranking_inventory');
  IF installed <> 10 THEN RAISE EXCEPTION 'Ranking infrastructure is incomplete: expected 10 enabled triggers, found %', installed; END IF;
  IF (SELECT count(DISTINCT migration_name) FROM _prisma_migrations
      WHERE migration_name IN ('20261023130000_room_rankings','20261023140000_hourly_gift_rankings')
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Ranking migrations must be completed before restoring markers';
  END IF;
  INSERT INTO "RoomRankingRevision" (id, revision, "createdAt")
  SELECT marker.id, floor(extract(epoch FROM clock_timestamp()) * 1000000)::bigint, min(m.finished_at) AT TIME ZONE 'UTC'
  FROM (VALUES ('__coverage__','20261023130000_room_rankings'),
    ('__visibility__','20261023130000_room_rankings'),
    ('__hourly_gifts__','20261023140000_hourly_gift_rankings')) AS marker(id,migration)
  JOIN _prisma_migrations m ON m.migration_name=marker.migration
  WHERE m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM "RoomRankingRevision" r WHERE r.id=marker.id)
  GROUP BY marker.id
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS repaired = ROW_COUNT;
  RETURN repaired;
END $$;
SELECT ensure_ranking_markers();

CREATE FUNCTION restore_ranking_markers_after_reset() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM ensure_ranking_markers();
  RETURN NULL;
END $$;
CREATE TRIGGER ranking_markers_after_reset
AFTER DELETE OR TRUNCATE ON "RoomRankingRevision"
FOR EACH STATEMENT EXECUTE FUNCTION restore_ranking_markers_after_reset();

COMMIT;
