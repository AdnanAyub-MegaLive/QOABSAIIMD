# Mobile Wallet API

All mobile wallet routes require `Authorization: Bearer <sessionToken>` except the payment-provider webhook. Responses use the portal's standard `{ success, data }` / `{ success, error }` envelope and are not cached.

## Routes

- `GET /api/wallet` — current spendable coins, host salary as diamonds, coupons, and lifetime recharge.
- `GET /api/wallet/coin-packages` — active packages from `WalletCoinPackage`.
- `POST /api/wallet/top-ups` — creates a 15-minute pending provider order from `{ packageId, paymentMethod }`.
- `GET /api/wallet/transactions?limit=20&cursor=...` — cursor-paginated immutable ledger.
- `POST /api/wallet/transfers` — atomically transfers spendable coins using `{ recipientPublicId, coins }`.
- `POST /api/wallet/withdrawals` — reserves agency-linked host salary coins for payout.
- `POST /api/wallet/top-ups/webhook` — payment-provider confirmation endpoint.

## Payment integration

Configure `PAYMENT_CHECKOUT_BASE_URL` before creating top-up orders. The returned checkout URL contains `orderId`, `amount`, `currency`, and `method` query parameters. Coins are never credited by the order-creation endpoint.

The provider confirms payment with:

```http
POST /api/wallet/top-ups/webhook
X-Wallet-Webhook-Secret: <PAYMENT_WEBHOOK_SECRET>
Content-Type: application/json

{
  "orderId": "TOPUP-...",
  "providerReference": "provider-unique-id",
  "status": "COMPLETED"
}
```

The webhook is idempotent. Successful confirmation credits the server-recorded package total and creates a ledger entry in one serializable transaction. Client-supplied prices and balances are never accepted.

## Business rules

- Transfers default to 100–100,000 coins; override with environment variables.
- Withdrawals default to 10,000–10,000,000 salary coins.
- Only users with the `HOST` application role and an agency can withdraw.
- The default conversion is 20 salary coins per PKR.
- Existing Store purchases, gifts, and admin coin adjustments also write immutable wallet ledger entries atomically.
