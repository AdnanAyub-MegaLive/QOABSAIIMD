# Ranking marker protection

`RoomRankingRevision` contains infrastructure markers, not just ranking records:
`__coverage__`, `__hourly_gifts__`, and `__visibility__`.

Migration `20261116103000_protect_ranking_markers` restores missing markers and
installs an AFTER DELETE / TRUNCATE statement trigger. Existing marker revisions
and timestamps are preserved. Restored markers use the original completed ranking
migration time for coverage and a fresh revision to invalidate old snapshots.
The function refuses to seed markers if the ten source-ranking triggers or either
original completed migration are missing. It does not change wallets, gifts,
game entries, scores or rewards.

Deployment runs `node scripts/check-ranking-markers.mjs` after `prisma migrate
deploy`, before restarting the portal. Failure leaves the running release intact.
Run the same command after database restores. A full schema rebuild must use
migrations; `db push` alone does not install SQL triggers. Restores that disable
triggers or overwrite the schema must reapply this migration/check before use.

Test: `node scripts/test-ranking-markers-db.mjs` (local database only). Uses an
isolated schema inside a rolled-back transaction; verifies repair, idempotence,
DELETE/TRUNCATE protection, coverage timestamps and cache revision invalidation.
