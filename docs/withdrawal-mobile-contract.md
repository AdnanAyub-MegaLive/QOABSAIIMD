# Withdrawal integration — 2026-10-11

Status: implemented locally; not deployed or verified against production.

## Wallet

Both `GET /api/wallet` and `GET /api/v1/wallet` return existing balance fields plus:

```json
{
  "currencyPolicy": {"version": 4, "configured": true, "rules": {}},
  "canWithdraw": false,
  "withdrawal": {
    "canWithdraw": false,
    "accountEligible": true,
    "configured": false,
    "enabled": false,
    "reason": {
      "code": "PAYOUT_CONFIGURATION_INCOMPLETE",
      "message": "Withdrawals are unavailable while the platform completes payout rates, limits and fees."
    },
    "method": "USDT_TRC20",
    "currency": "USDT",
    "network": "TRC20",
    "policyVersion": 4
  }
}
```

These fields are inside the usual `success:true,data` envelope. `rules` contains the actual saved policy, not an empty object; above it is abbreviated. Policy `configured` indicates a saved policy exists; `withdrawal.configured` specifically indicates its payout settings are complete and valid. No saved policy means payout rates/limits/fee bearer are null and withdrawals are unavailable. A saved but incomplete policy is not silently supplemented with payout defaults.

Payout rules: `withdrawalDiamondsPerUsd`, `usdtMicrosPerUsd`, `withdrawalMinDiamonds`, `withdrawalMaxDiamonds`, `feeBearer` (HOST or COMPANY), `usdtEnabled`, and `commissionChart` (`minUsdMicros`, `bps`, `fixedUsdtMicros`, `networkUsdtMicros`). Monetary values are decimal strings. One USDT = 1,000,000 micro-units; conversion between USD and USDT is configured, not presumed 1:1.

Reason is null when available, otherwise one of `WITHDRAWAL_NOT_ALLOWED`, `PAYOUT_CONFIGURATION_INCOMPLETE`, `WITHDRAWAL_DISABLED`, `INSUFFICIENT_DIAMONDS`. Only active agency-linked hosts are eligible. Missing configuration is checked before the disabled switch for eligible users. Balance availability does not guarantee a given amount meets all limits/fees.

## Quote before confirmation

`POST /api/v1/wallet/currency-quote`, Bearer session:

```json
{"diamonds":"90000","destination":"<valid TRON address>"}
```

Returns `diamonds`, `destination`, `method`, `currency`, `network`, `policyVersion`, `grossUsdMicros`, `grossUsdtMicros`, `commissionMicros`, `networkFeeMicros`, `netUsdtMicros`, opaque `quoteToken`, and ISO `expiresAt` (10 minutes). Company-paid network fees are not deducted from the host's quoted amount. Quote validates account, configuration, available balance, limits, destination checksum and positive net payout. It reserves nothing.

Display gross amount, commission, host-paid network fee, final USDT, destination and Diamonds. Require the user's confirmation. Treat the quote token as opaque and do not log it.

## Submit

`POST /api/v1/wallet/currency-requests` (also `/api/wallet/currency-requests`):

```json
{
  "kind":"USDT",
  "diamonds":"90000",
  "destination":"<same TRON address>",
  "policyVersion":4,
  "quoteToken":"<quote token>"
}
```

Require `Idempotency-Key: <unique operation key, 8–128 safe characters>`. Retain the same key for retries of the same operation. Never generate a new key just because a response timed out.

`POST /api/v1/wallet/withdrawals` and its unversioned alias also accept these fields with `method:"usdt_trc20"` instead of `kind`. The shorter legacy response still returns withdrawalId/status/diamonds/netUsdtMicros/currency/network.

Server validates the signed quote's user, amount, destination, expiry and current policy version, rechecks eligibility/balance, and conditionally reserves Diamonds inside the serializable request/ledger transaction. Missing, expired, changed or mismatched quotes return **409 CURRENCY_QUOTE_EXPIRED**. Fetch a new quote and ask the user to confirm again. No supplied prices, fees or XP are trusted.

A previously committed operation with the same key and financial payload returns its existing request/current status, even when the quote has since expired or rates changed. A changed amount/destination/type with the same key returns **409 IDEMPOTENCY_CONFLICT**. Retries do not reserve twice.

## History and cancellation

`GET /api/v1/wallet/currency-requests?limit=20&cursor=<id>`: `{requests:[],nextCursor:null}`. Maximum 50, newest first, cursor scoped to the authenticated account. Resellers also see transfers addressed to them.

Each request includes Diamonds, quoted Coins where applicable, net USDT micros, destination, status, createdAt/updatedAt, policy snapshot, `quote` with gross/deductions, `rejectionReason`, `canCancel`, payoutHash and lifecycle timestamps `approvedAt`, `rejectedAt`, `cancelledAt`, `paidAt`, `paymentVerifiedAt`. Old records may have null lifecycle timestamps; none are invented. COMPLETED means paid for USDT, redeemed for REDEMPTION, or host-confirmed external settlement for RESELLER_TRANSFER.

`PATCH /api/v1/wallet/currency-requests` with `{id,action:"CANCEL"}` refunds only pending non-transfer requests once. Approved requests cannot be cancelled by the user. Admin rejection refunds the reserved Diamonds once. Historical legacy withdrawals remain available in `GET /api/v1/wallet/withdrawals` under the existing `withdrawals` field; the additional `currencyRequests` field is a recent USDT snapshot. Use the paginated currency-requests endpoint for complete new history.

## Admin review

Rules & Profit Split → Currency & Salary → Review Queue:

- Approve creates APPROVED, not a paid state.
- After paying externally, verify the successful TRC20 transaction, destination and amount; enter its unique 64-character hash, verification note and check the verification confirmation before marking paid.
- This is human verification, not automatic blockchain verification. The system neither sends funds nor confirms on-chain settlement itself.
- Payment confirmation stores hash, verifier identity through the reviewer/audit record, and payment verification/payment timestamps.

Deployment requires migration `20261011020000_withdrawal_timestamps`, Prisma generation, build and process restart. No balance recalculation, historical deletion or automatic payout is performed. If production wallet still omits currencyPolicy, its running code does not match this local implementation; deploy and verify the actual wallet response before enabling the app flow.
