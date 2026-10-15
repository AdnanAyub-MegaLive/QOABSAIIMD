# Reseller payout escrow integration

New bank payouts reserve Diamonds immediately, credit the reseller only after host confirmation or an authorized support release, and refund the sender only on cancellation or a support refund decision. Existing `CurrencyRequest` transfers retain their old behavior and must not be resubmitted to these endpoints.

## Deployment

Apply `202610150003_reseller_payout_escrow`, regenerate Prisma, rebuild and restart `node server.js`. Configure `PAYOUT_BANK_ENCRYPTION_KEY` as a stable 64-character hex key generated from 32 random bytes. Keep it private and backed up separately; do not rotate it without a bank-data re-encryption plan. Missing encryption configuration disables new payout creation. No existing balances or transfers are migrated.

The server runs deadline reconciliation every minute. A restart recovers overdue records on the next pass. Monitor `Reseller escrow maintenance failed` and `Payout deadline requires retry or manual review`; never run this deployment with only `next start`, which omits the custom server maintenance loop.

## States and deadlines

| State | Funds | Next action |
| --- | --- | --- |
| PENDING | Reserved from sender | Reseller chooses 1, 3 or 5 days and uploads/submits proof |
| AWAITING_HOST | Still reserved | Host confirms or disputes within 24 hours |
| SUPPORT_REVIEW | Still reserved indefinitely | Authorized staff release or refund with a reason |
| COMPLETED | Credited once to reseller | No automatic refund or further mutation |
| CANCELLED | Refunded once to sender | No further mutation |

Initially the deadline is creation plus 3 days. Before that deadline, the reseller chooses once from 1, 3 or 5 days, always measured from creation. An already elapsed window cannot be selected. Uploading a screenshot alone neither completes the payout nor starts the verification window. Submitting proof before the payment deadline starts a fresh 24 hours. Non-response moves to support review, never automatic release. Unsubmitted payouts expire and refund; suspension of the reseller instead leaves the payout pending for staff reassignment or cancellation. Reassignment does not extend the deadline. All pending records older than 3 days are flagged for review, including valid 5-day windows.

## Mobile authentication and capabilities

Every endpoint uses the existing Bearer mobile session. Wallet responses include `resellerPayout` with enabled/reason, available Diamonds, transfer rules, payout min/max, day choices and verification hours. Existing role eligibility, CS restrictions, same-country checks, transfer limits and payout configuration apply. Both transfer and USDT payout min/max restrictions must pass. Amounts are decimal strings; USDT breakdown fields are integer micro-USDT strings.

## Quote and create

POST `/api/v1/wallet/reseller-payouts` with `action: QUOTE`, `diamonds`, `resellerPublicId`, and `bank` containing `accountHolder`, `bankName`, `accountNumber`, and optional `otherDetails`. Country comes from the sender account. All bank fields are plain text, not HTML.

The success data includes `grossUsdMicros`, `grossUsdtMicros`, `commissionMicros`, `networkFeeMicros`, `netUsdtMicros`, `policyVersion`, `expiresAt` and `quoteToken`. Show these before confirmation. The signed ten-minute token binds the account, reseller, amount, bank details, country and policy version.

Create using the same body without `action: QUOTE`, plus `quoteToken`, with an `Idempotency-Key` of 8–128 letters/numbers/dot/underscore/colon/hyphen. A retry with the same key and payload returns the existing payout's current state without another debit, even if the quote has since expired. Changed details with that key return `IDEMPOTENCY_CONFLICT`. Lost responses are recovered by repeating the same request, not generating a new key.

## Lists and details

GET `/api/v1/wallet/reseller-payouts?view=sent|received&tab=PENDING|COMPLETED|CANCELLED&cursor=...` returns `items`, `nextCursor` and tab `counts`, 20 items per page. Pending includes waiting for host and support review. Rows contain the sender and reseller names/public IDs/profile images, Diamonds, quote, masked bank, status, dates, deadlines and payment reference. Stable newest-first ordering uses creation timestamp and internal ID.

GET `/api/v1/wallet/reseller-payouts/{id}` returns details. Only the sender, chosen reseller or authorized portal staff can access the record. The full decrypted `bank` object is returned only to the chosen reseller and permitted staff. The host receives `maskedBank`; lists never expose full bank details. Another reseller receives 404. Display ISO timestamps in the user's timezone; calculate countdowns from server deadlines, not local elapsed timers.

## Reseller and host actions

PATCH `/api/v1/wallet/reseller-payouts/{id}` with:

- Reseller: `{ action: "SET_DEADLINE", days: 1 | 3 | 5 }`.
- Reseller: `{ action: "SUBMIT_PROOF", reference: "optional bank reference" }` after uploading.
- Sender: `{ action: "CONFIRM_RECEIPT" }` to release Diamonds.
- Sender: `{ action: "DISPUTE", reason: "Payment not received" }` to hold for support.

POST `/api/v1/wallet/reseller-payouts/{id}/proof` accepts one multipart `image`, JPEG or PNG, maximum 5 MiB. The server checks and fully decodes the image, strips metadata and re-encodes it. Upload can be replaced only while pending and before the deadline. No public upload asset or CDN URL is created.

Fetch `proofUrl` with Bearer authentication. It is a relative protected URL, not a public link. The host may read proof only after submission. Use `Cache-Control: private, no-store`; do not put bank details or proof into the app's public media cache, analytics or logs. Proof viewing is audited. Show “payment submitted, awaiting confirmation,” not “completed,” after proof submission.

## Portal support

Rules and Profit Split → Currency and Salary → Review Queue includes the reseller escrow panel with tabs, private details, proof links and action confirmations. Staff need the existing `finance.withdrawals` permission; a mobile CS role alone does not authorize financial resolution. Give designated support staff a portal account with the required permissions and access to Rules (`rules.view`).

Admin endpoints use the same paths under `/api/admin/wallet/reseller-payouts`. PATCH supports `CANCEL` for pending, `REASSIGN` for pending with `resellerPublicId`, and `RESOLVE_REFUND` or `RESOLVE_RELEASE` for support review. Each requires `reason`. Completed payouts cannot be cancelled. Ineligible resellers cannot receive releases; keep the case held or refund through support.

## Notifications and legacy compatibility

Notifications use type `DIAMOND_PAYOUT` and action `{ screen: "DIAMOND_PAYOUT", payoutId }`. Reassignment notices to a removed reseller navigate to Wallet instead. Event source keys prevent duplicate notification records; clients should still deduplicate socket delivery by notification ID. Bank numbers never appear in generated notifications. Refresh details on opening a notification and on foreground/reconnect.

Existing `/wallet/currency-requests` and legacy `CONFIRM_EXTERNAL` stay unchanged. Do not interpret legacy IDs as new escrow IDs or credit their recipients again. New confirmed credits record Host-transfer provenance only when the sender qualified as an agency-linked Host at creation. Other eligible roles may use the payout flow but their transfers do not become Host-source redemption inventory.

## Phone verification

Test same-country eligibility, policy changes after quoting, insufficient funds, duplicate taps and lost responses. Verify no reseller credit on creation/upload/submission; exactly one credit on receipt confirmation; exactly one refund on unpaid expiry or authorized cancellation. Test all three day choices, 24-hour timeout, dispute resolution, private proof denial for unrelated users, suspended reseller handling and legacy confirmation. Use dedicated test accounts; never shorten real customers' deadlines for testing.
