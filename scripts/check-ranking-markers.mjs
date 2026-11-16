// Run after migrations and before switching the live process. No source records are changed.
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: '.env.local', quiet: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const result = await client.query('SELECT ensure_ranking_markers() AS repaired');
  const protection = await client.query(`SELECT 1 FROM pg_trigger WHERE tgrelid='"RoomRankingRevision"'::regclass AND tgname='ranking_markers_after_reset' AND tgenabled IN ('O','A')`);
  if (protection.rowCount !== 1) throw new Error('Ranking reset protection is missing or disabled.');
  await client.query('COMMIT');
  console.log(`Ranking markers healthy; restored ${result.rows[0].repaired} missing marker(s). Reset protection enabled.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Ranking marker check failed:', error.message);
  process.exitCode = 1;
} finally { await client.end(); }
