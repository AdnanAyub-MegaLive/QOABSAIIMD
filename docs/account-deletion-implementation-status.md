# Account and associated-data deletion

Implementation prepared 15 November 2026. Activation is controlled by ACCOUNT_DELETION_ENABLED=true.

## Operation

- Users request through authenticated POST /api/v1/users/me/deletion, or email support@megalive.live using the public deletion page. Existing installed apps receive instructions through Settings → Help Center. The new native Settings shortcut is included in the next app release.
- Administrators with users.delete use /account-deletions after verifying the requester owns the account. The existing user-delete action now uses the same queue.
- Queue creation immediately revokes account access. A six-minute drain precedes cleanup, followed by bounded worker passes every 30 seconds. Transactions have short lock and statement timeouts. Pending financial settlements stop cleanup for support review, without cancelling other users' money.
- Owned profile, content, CP, device, social, inventory and activity records are removed. Shared accounting amounts retain an identity-free user tombstone. Private room music and personal images are removed; purchased global catalogue artwork is not deleted.
- Storage/CDN failures remain MEDIA_PENDING and retry. After ten failures support must use Process / retry. Requests stop at REVIEW_REQUIRED; support verifies legacy/external provider copies and backup handling before Confirm completion. Never confirm a user request before this review.
- A database trigger prevents erased identities receiving delayed wallet credits or being reactivated.
- Support target: five business days; explain any pending-settlement or provider delay to the requester. Do not send passwords or verification documents over the initial email.

## Recovery and retention

- DO CDN token: /etc/megalive/account-deletion-cdn.env, 0600. Token expires 13 February 2027; rotate before expiry. Helper calls /cache only, with exact application object paths and query variants.
- Journal: ACCOUNT_DELETION_JOURNAL_DIR=/etc/megalive/account-deletion-journal, 0700. Minimal per-request recovery markers are 0600 and written before completion.
- Startup refuses a restored deleted account or an incomplete restored deletion. After restoring a database, keep portal/workers stopped, migrate, then run `node scripts/privacy/replay-deletions.mjs --offline-confirmed`. Review any pending financial settlement before reopening traffic. Never bypass the startup guard.
- Database backups: /etc/megalive/backup-retention.json, 30-day expiry, hourly root cron. Only registered regular files with exact size/mtime are eligible. New deployments call scripts/privacy/create-backup.sh. Use that wrapper for future manual backups too; any externally copied dump must follow the same expiry policy.
- Minimal recovery markers expire after 30 days only when no registered pre-erasure backup remains. Do not make unregistered backups or copy journals to ungoverned locations.
- Restricted runtime/security logs rotate with expiry within 30 days. De-identified accounting records are retained for fraud prevention/reconciliation; no personal contact or login credentials are kept there.

## Verification

Isolated PGlite tests exercise actual PostgreSQL constraints, full Prisma deletion, idempotency, unknown FK failure, shared-wallet isolation, CP history, room music, CDN failure/retry, completion attestation, restore guards and prevention of delayed account revival. No real user's account is deleted as a test.

Deployment builds a separate release while the existing process serves traffic, applies additive schema, then switches the single PM2 process with health checks and rollback. The process switch can briefly reconnect sockets; do not describe this as guaranteed zero downtime. Public disclosures and Help Center content are published only after deployment health checks.

Data Safety submission is a separate final step. Never submit the unrelated V22 rollout with it.
