# Diamond Transfer and Exchange

Both services have **zero transaction fees**. Official USDT payouts and reseller redemption retain their separate policies. No balances or historical ledger rows are migrated.

## Portal configuration

In Rules & Profit Split → currency settings, configure each service's minimum, maximum, amount multiple, daily limit and monthly limit. Exchange uses the configured ordinary-user or agency-linked-host rate. Availability toggles and per-account exchange restrictions still apply. Incomplete rules make that service unavailable with a readable reason; administrators must complete the new limits before rollout.

Limits are per sender, separately for each service, on UTC calendar days/months. Usage is measured from actual Diamond ledger debits, including existing historical debits. Exchange rounds down and leaves unused Diamonds in the wallet; these unused Diamonds do not consume the daily/monthly allowance. Minimum, maximum and multiple checks apply to the submitted amount.

## Mobile contract

All calls require the existing Bearer session. Never send a country to authorize a transaction.

- `GET /api/v1/wallet` (also `/api/wallet`) always includes `diamondTransfer` and `diamondExchange`: `enabled`, `reason`, `policyVersion`, `minDiamonds`, `maxDiamonds`, `amountMultiple`, `dailyLimit`, `monthlyLimit`, `feeDiamonds: "0"`, `feeBps: 0`, `periodTimezone: "UTC"`. Exchange also includes `diamondsPerCoin`. Amounts are decimal strings, or null when unconfigured.
- `GET /api/v1/wallet/resellers?q=&page=1` (also `/api/wallet/resellers`) returns `data: { page, hasMore, items }`, 20 rows per page. Each item contains `publicId`, `displayId`, `name`, `profileImage`, `country`. Display the active Special ID when supplied as `displayId`, and submit `publicId`. Only active, unbanned, non-deleted resellers in the caller's account country appear; the caller is excluded. Client country parameters are ignored.
- `POST /api/wallet/currency-requests`: `{ "kind": "RESELLER_TRANSFER", "diamonds": "10000", "recipientPublicId": "USR-123", "policyVersion": 3 }`. Existing response/status contract is retained. Transfers remain restricted to agency-linked hosts. Eligibility and country are checked again inside the transaction. The reseller receives the full submitted Diamonds.
- `POST /api/v1/wallet/exchange` (also `/api/wallet/exchange`): `{ "diamonds": "10000" }`. Existing balance/receivedCoins/exchangedDiamonds response is retained.

Both mutations require `Idempotency-Key` (8–128 letters, digits, `.`, `_`, `:`, `-`). Keep the same key and payload for retries; use a new key for each intentional operation. Same-key/different-payload returns `IDEMPOTENCY_CONFLICT`; a replay does not debit again. A transfer replay returns the existing request's current status. Exchange returns its originally committed result; refresh the wallet for subsequent balance changes.

Errors include `TRANSFER_COUNTRY_MISMATCH`, `RESELLER_INELIGIBLE`, `TRANSFER_DISABLED`, `EXCHANGE_DISABLED`, `*_BELOW_MINIMUM`, `*_ABOVE_MAXIMUM`, `*_INVALID_MULTIPLE`, `*_DAILY_LIMIT`, `*_MONTHLY_LIMIT`, `INSUFFICIENT_DIAMONDS` and `INVALID_IDEMPOTENCY_KEY`. Continue parsing the common error envelope.

Balance changes, ledger entries and idempotency records run within serializable transactions with bounded conflict retries. No database schema migration is required; settings use the existing versioned currency-policy record and audited admin save.
