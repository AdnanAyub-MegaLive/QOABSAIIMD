# Room owner daily reward: Coins

After deployment, the daily room reward credits the owner's personal **Coin balance**, not Diamonds. At the existing default 2% rate, 100,000 eligible gifted Coins produces 2,000 reward Coins. The Portal percentage remains configurable.

Full business days run 00:00–00:00 UTC+7 (17:00–17:00 UTC). The timezone rollout keeps its previously configured transition and historical boundaries. Calculation floors once on the room's total, not per gift. Paid single sends, combos and multi-recipient sends count; free backpack gifts and reversed gifts are excluded.

The payout, Coin ledger entry, notification and paid receipt commit together. Retries do not pay twice. Unpaid legacy snapshots pay their calculated amount in Coins; already-paid Diamond rewards remain historical Diamond records and are neither converted nor paid again. Portal payout history displays the actual currency.

## App change

The existing app override from Spec 187 rewrites `ROOM_REWARD` notices to Diamonds. Remove that hard-coded currency. Prefer the server body, or use `action.rewardCurrency === "COINS"` and `action.coins` when localizing a new notice. Older notices without that field remain Diamonds.

New notification:

```json
{
  "type": "ROOM_REWARD",
  "title": "Daily room reward received",
  "body": "2000 Coins are earned by the Room owner on 2026-12-02",
  "action": {
    "screen": "WALLET",
    "roomId": "ROOM-…",
    "payoutId": "…",
    "rewardCurrency": "COINS",
    "coins": "2000"
  }
}
```

Open the Coin wallet for new rewards. The wallet-history entry is `BONUS / CREDIT`, `coins: "2000"`, `diamonds: null`, with `metadata.rewardCurrency: "COINS"`. Refresh the Coin wallet balance after the notice; the normal wallet APIs are unchanged.

Deploy with `bash scripts/deploy-droplet.sh` after pulling main. The additive database migration runs while the old release remains online, then the new release begins paying Coins after restart.
