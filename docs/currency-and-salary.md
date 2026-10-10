# Coins, Diamonds and salary

Admin UI: Rules & Profit Split → Currency & Salary. Tabs: Gift & Recharge,
Exchange, Resellers, USDT Commission, Review Queue. Policy changes require
`rules.manage`; request reviews require `finance.withdrawals` and page access.

Initial policy (version 1):
- Gift gross Coins to recipient Diamonds: 1:1, for users and hosts.
- Recharge: 45,000 base Coins/USD, rounded up to the nearest USD cent.
  Existing package bonuses remain explicit additional Coins.
- Salary valuation: 90,000 Diamonds/USD.
- Ordinary-user exchange: 2 Diamonds/Coin, minimum 10,000 Diamonds (retained
  existing default). Remainders are not debited. Individual exchange-disable flags remain enforced.
- Host exchange and reseller redemption: disabled until their rates/deductions are configured.
- Official payouts: disabled until admin configures conversion, limits and fees.
- Resellers use reviewed redemption, not the ordinary-user exchange shortcut.

No existing wallet balances or historical ledger entries are rewritten. The
existing `hostSalaryCoinBalance` column continues to hold available Diamonds for
all users; it has not been renamed or revalued. New GiftSettlement rows have
`recipientDiamonds` and `currencyPolicyVersion`. Existing coin-allocation fields
remain accounting allocations, not proof of a spendable recipient Coin credit.
Agency commission still follows the audio/live profit split. Gift conversion can
use gross gift Coins or the recipient allocation after that split.

## Mobile contracts

Bearer session required. Amounts are decimal strings. Never use floating point
for authoritative calculations. GET `/api/v1/wallet` includes `currencyPolicy`
and account-specific `diamondExchange`. Existing exchange routes are retained.

POST `/api/v1/wallet/currency-quote` body `{ "diamonds": "90000" }` returns
policyVersion, grossUsdMicros, grossUsdtMicros, commissionMicros, networkFeeMicros,
netUsdtMicros. 1,000,000 micro-units = 1 USD or USDT. Quotes do not reserve funds.

POST `/api/v1/wallet/currency-requests` (also `/api/wallet/currency-requests`)
requires `Idempotency-Key` (8–128 safe characters). Body examples:

```json
{"kind":"RESELLER_TRANSFER","diamonds":"90000","recipientPublicId":"USR-RESELLER"}
{"kind":"REDEMPTION","diamonds":"90000"}
{"kind":"USDT","diamonds":"90000","destination":"<TRON address>","policyVersion":2}
```

POST returns 201 `{success:true,data:request}`. GET returns `{success:true,data:{requests:[]}}`
with the latest 50 own/received requests. Same idempotency key and payload replays
the stored request (including current review state); different financial inputs conflict.

Host transfers move Diamonds immediately, with paired ledger entries, and remain
PENDING_EXTERNAL until the host confirms receipt of external payment:
PATCH same endpoint `{ "id":"...", "action":"CONFIRM_EXTERNAL" }`.
This is the host's attestation, not bank/chain verification. Resellers cannot
confirm payment on the host's behalf.

USDT and redemption requests debit available Diamonds immediately as a reservation.
PATCH `{ "id":"...", "action":"CANCEL" }` refunds only a still-pending own
request. Rejection also refunds; approval prevents user cancellation. Redemption
approval credits quoted Coins once. USDT approval does not send funds: an admin
manually pays, checks the TRON transaction, then records its unique 64-hex hash.
Hash format validation is not on-chain verification. Check network, USDT contract,
destination, amount and confirmations before marking paid.

Legacy withdrawal POST now accepts only `method: "usdt_trc20"`, `diamonds`,
`destination` (or accountNumber), and Idempotency-Key. Use the currency-requests
API for new history; legacy withdrawal GET preserves old `withdrawals` and also
returns new `currencyRequests`. Historical bank/PKR records remain untouched.

USDT uses the admin-set micro-USDT/USD conversion, bracketed percentage + fixed
commission, and host/company network-fee responsibility. No implicit USD/USDT
peg or fee default is enabled. Amounts are calculated with integer arithmetic.

## Deployment / verification

Apply migrations, regenerate Prisma, build and restart. No production changes
were made by this implementation. USD packages must be configured/activated;
old PKR packages are excluded from new checkout, not modified. Verify the actual
payment provider supports USD before enabling production recharge.

Test two-device concurrent transfers/exchanges, insufficient balance, duplicate
requests and approvals, rollback, cancellation/refund, host/reseller eligibility,
and policy changes during quote submission. Existing and new finance ledgers
must be reconciled before production activation. `scripts/test-currency-db.mjs`
exercises local requests inside a transaction that always rolls back.

Company payouts remain manual; no private wallet key or blockchain transfer API
is added. No legacy Diamonds are minted from past gift records automatically.
# Withdrawal contract update

For USDT quotes, mandatory quote confirmation, availability reasons and paginated history, use [withdrawal-mobile-contract.md](withdrawal-mobile-contract.md). It supersedes the earlier optional-policy-version withdrawal flow below. A new USDT request now requires both `policyVersion` and `quoteToken`.

