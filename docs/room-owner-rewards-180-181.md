# Daily room owner rewards — specs 180/181

## Implementation

GiftTransaction.operationKey links each newly settled multi-recipient gift (including each combo tap) to the request's single debit. The daily query sums each recipient's recorded coinValue exactly once. A completed GIFT_SENT debit for the same sender and either gift ID or operation key is required. Backpack, reversed, live-video and unpaid gifts remain excluded. No time-window matching or historical backfill is performed.

Activation has a rules.levels-protected, same-origin PATCH /api/admin/room-rewards action and an Activate from tomorrow button. Repeated activation does not move an existing cutoff. The page identifies missing activation and missing policy separately. Policy edits retain rules.edit permission and apply from next UTC midnight.

Notifications use the current room title (room ID fallback) and action.screen DIAMONDS. Ownership is resolved at the daily snapshot; changing owners during the day pays the owner at snapshot time. Completed day receipts are not recomputed. Refunds after payout continue to require manual review, without clawback.

## Production inspection and authorized repair — 3 November 2026

Deployed commit inspected: 4e81997. Production database: megalive, public schema. The activation migration was applied on 23 October, but activation and policy records were missing, with zero payouts. prisma migrate deploy reported no pending migrations.

Created GLOBAL activation with startsAt 2026-11-04T00:00:00.000Z and policy version 2 (enabled, 200 basis points) effective at that same instant, plus an audit record. No users, balances, gifts, or existing historical records were updated. First eligible day closes 2026-11-05T00:00:00.000Z.

The operation-link code and migration are local and NOT deployed. Deploy before 4 November 00:00 UTC to avoid incomplete coverage for that first eligible day. Older multi/combo records lack the link and are not automatically recovered. Do not use approximate timestamp matching to backfill financial records.

## Deployment and verification

Apply migration 20261103150000_room_reward_operation_link, generate Prisma client, rebuild, restart. No app changes are required. Isolated PostgreSQL verifies three combo taps, four recipients, duplicate debit evidence, sender matching, excluded gifts, UTC end boundaries and the 6000 Coins -> 120 Diamonds acceptance example. Authorization and idempotent activation are tested separately.

Actual next-day production payout and wallet/phone notification verification remain pending; no payout worker was manually invoked. The optional owner rewards-list API is not part of this fix.
