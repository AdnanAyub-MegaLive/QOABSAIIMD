-- One statement: PostgreSQL requires concurrent index builds outside a transaction.
CREATE INDEX CONCURRENTLY "WalletTransaction_tulasi_round_idx"
  ON "WalletTransaction" ("userId", (metadata->>'gameId'), (metadata->>'gameStartTimestamp'))
  WHERE metadata->>'provider' = 'TULASI' AND type IN ('GAME_WAGER', 'GAME_PAYOUT');
