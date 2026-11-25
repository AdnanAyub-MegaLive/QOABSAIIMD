-- Read-only diagnostic snapshot. No SQL texts, user IDs or credentials.
BEGIN READ ONLY;
SELECT clock_timestamp() AS observed_at, pg_postmaster_start_time() AS server_started;
SELECT state, wait_event_type, wait_event, count(*)
FROM pg_stat_activity WHERE datname = current_database()
GROUP BY state, wait_event_type, wait_event;
SELECT numbackends, xact_commit, xact_rollback, deadlocks, temp_bytes,
       blk_read_time, blk_write_time, stats_reset
FROM pg_stat_database WHERE datname = current_database();
SELECT name, setting FROM pg_settings
WHERE name IN ('track_io_timing', 'max_connections', 'shared_buffers', 'statement_timeout');
COMMIT;
