# Received-gift Charm progression

The paid-gift route previously passed a null progression recipient whenever a Talent record existed, even if the matching User was loaded. It now passes that User. The shared award function additionally resolves a missing recipient through GiftTransaction.recipientUserId, then the Talent's exact canonical public ID. No email/name/phone/numeric-suffix matching is performed. Unmapped legacy Talent records remain unawarded pending verified identity mapping.

Wallet settlement is unchanged. Awards still run within the gift's serializable transaction. CHARM uses receiverXp multiplied by gift quantity for GIFT_XP rules, then the configured integer numerator/denominator. USER uses senderXp independently. Each recipient/source gift has a unique ledger key; the same gift cannot award the same track twice. Updating UserProgress and writing progression:updated to the transactional outbox remain atomic. Mobile refreshes progression over REST on reconnect and ignores older revisions.

## Rules

The original gift-XP seed contained HOST Charm rules but no NORMAL_USER rules. Migration 20261014170000_normal_user_charm_rules creates new immutable configuration versions, copying thresholds and rules, and adds only missing NORMAL_USER rules corresponding to HOST GIFT_XP rules. Existing normal-user rules, zero rates, self-gift choices and disabled configurations are preserved. Current progress rows move to the new version without changing XP totals or levels. Historical ledger versions remain unchanged. No retrospective awards occur in this migration.

## Historical review — no wallet writes

Run `node scripts/review-missed-charm.mjs` for configuration coverage and aggregate counts; add `--details` for gift IDs requiring investigation. It uses the configured database read-only. Do not publish detailed reports publicly.

A missing Charm ledger is not proof that XP was owed: progression might have been disabled, normal users excluded, receiver XP zero, self-gifts excluded, or the gift reversed. Current assets are editable, and historical receiverXp is not snapshotted on GiftTransaction. Sender XP cannot establish receiver XP. Confirm source (PAID/BACKPACK/LUCKY/BLIND_BOX), the recipient's pinned configuration at the time, settlement and historical receiver XP from trustworthy exports/audit evidence.

Do not automatically backfill from current gift XP or current rules. Once reviewed, a correction must be CHARM-only, within a serializable transaction with bounded retries: lock the recipient progress, recheck reversal and the original unique source key, insert GIFT_RECEIVED using the original gift ID for sourceId/sourceLineId, update points/level/revision, and enqueue progression:updated. Record evidence/approved rule version in an audit entry. Skip previously awarded sources, including when rerun. Never replay the gift endpoint, debit the sender, rerun settlement or modify balances. No historical correction has been executed by this change.

Deploy migrations, regenerate Prisma, build and restart the custom server. Verify Talent and normal-user gifts on devices; confirm one receiver event, correct level, deduplicated retries and unchanged settlement behavior.
