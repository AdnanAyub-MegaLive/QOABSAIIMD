# Spec 214: Google recharge USD display price

After deployment, authenticated `GET /api/v1/wallet/google-recharge` retains its existing envelope and adds `priceUsd` to each `data.products[]` item:

```json
{ "productId": "payment_07", "coins": "42000", "priceUsd": "4.99" }
```

`priceUsd` is a two-decimal string or `null` when unset. Existing products start unset; no prices are guessed. Keep the app's “Price in USD not set” fallback for null values.

Admins with `rules.currency` can set or clear prices in Finance → Google Recharge. They must maintain the same US price for the same product ID in Play Console and the Portal; there is no automatic synchronization. Price changes are audit-logged.

This price is for display only. Google purchase verification, credited coins, receipt idempotency and local-currency checkout are unchanged. Deploy the additive `20261112220000_google_recharge_usd` migration before starting the updated server.
