-- One statement: PostgreSQL requires concurrent index builds outside a transaction.
CREATE INDEX CONCURRENTLY "WalletTransaction_tulasi_activity_time_idx"
  ON "WalletTransaction" ("createdAt")
  WHERE metadata->>'provider' = 'TULASI' AND type IN ('GAME_WAGER', 'GAME_PAYOUT');
