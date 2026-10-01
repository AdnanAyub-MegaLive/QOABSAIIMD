# Mega Live Portal cutover runbook

This runbook is the safety gate for replacing the old backend. Do not point the
existing legacy Android client at the portal host; it is not a drop-in API.

## 1. Prepare separate environments

- Keep development, staging, and production databases separate.
- Publish one stable HTTPS/WSS staging origin and configure Android only in a
  staging build variant first.
- Set all server secrets through the deployment environment, never Git.
- Record the old system as read-only reference data; do not perform an
  unreviewed direct production-to-production copy.

## 2. Build and validate the identity export

1. Export legacy numeric user IDs and room IDs with the intended portal public
   IDs into the JSON format in [mobile-api-v1.md](mobile-api-v1.md).
2. Review duplicates, missing users/rooms, and any ID collisions.
3. Run `legacy-ids:import` with `--dry-run` in staging.
4. Run the real import only after dry-run success and archive the signed export.
5. Verify samples in both directions: every migrated user/room has exactly one
   legacy mapping and it points to the current portal public ID. A user later
   approved as a verified host changes only from `USR-*` to `TLN-*`; preserve
   the numeric suffix and update the mapping.

## 3. Migrate data by domain

Migrate and reconcile domains in this order:

1. Users, device records, public-ID mappings, and account status.
2. Audio rooms and room ownership.
3. Wallet balances, transaction ledger, gifts, and props.
4. Agency ownership, host membership, targets, and earnings.
5. Friend/follow/blocked relationships and posts/media references.
6. Remaining approved domains: family, VIP, tasks, rankings, shop, and PK.

For every financial domain, compare count, sum, and per-user balances before
and after import. Do not use a one-way “copy completed” flag as validation.

## 4. Shadow and pilot release

- Run portal APIs against staging copies first.
- Test two real Android devices: login, session refresh/logout, room discovery,
  Socket.IO join/leave, LiveKit audience/speaker roles, gift/wallet flow, bans,
  and reconnects.
- Enable v1 for internal staff and a limited pilot cohort before the public
  release.
- Keep legacy APIs available only for features explicitly not yet migrated.
- Track v1 `X-Request-Id` values and server request logs while investigating
  pilot errors.

## 5. Production switch

The switch is allowed only when every retained legacy screen has a portal
replacement, an approved retirement decision, or a documented temporary legacy
owner. Freeze writes to a migrated legacy domain, run the final incremental
import, reconcile it, then enable the portal feature for that domain.

Roll back feature routing—not data by destructive database restore—if the
acceptance checks fail. Keep backups and immutable wallet audit records.

## 6. Decommission

Only decommission a legacy domain after its portal replacement has been stable
through an agreed observation period, its data has been reconciled, and a
restore/export plan is tested. Revoke legacy credentials separately from the
portal session and LiveKit credentials.
