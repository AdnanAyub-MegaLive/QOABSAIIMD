# Gift batch correlation

The following sends accept optional `giftBatchId`:

- `POST /api/gifts/send`
- `POST /api/v1/gifts/send`
- `POST /api/v1/gifts/backpack/send`
- `POST /api/v1/gifts/lucky/send` (alias of catalog gift sending; rewards depend on the selected gift's tier)

Use the same non-empty string (maximum 64 Unicode code points) for every
recipient request in one send action. Omitted or null values produce null.
Invalid types, blank strings and excessive length return 422 `VALIDATION_ERROR`.
Accepted strings are preserved exactly, not trimmed or truncated.

Each successful response and every `gift:received` event includes
`data.giftBatchId`. Each recipient's `GiftTransaction` stores the nullable ID.
This is correlation metadata only: repeated IDs never merge, skip or deduplicate
transactions, inventory changes, wallet entries, events, totals or rankings.
It is not a retry/idempotency key. Group on sender identity plus batch ID, not
batch ID alone; different senders can supply the same string.

Deploy the migration, regenerate Prisma Client and restart the server before
enabling batch-ID grouping in the app. Verify all deployed send paths echo the
field; older clients can continue without supplying it. Existing transaction
records remain null. No client rollout is performed by this backend change.
