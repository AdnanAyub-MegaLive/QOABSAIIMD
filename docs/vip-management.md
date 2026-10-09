# Configurable VIP management

Portal: **VIP Management** (`/vip-management`). Staff permissions: `vip.view`
and `vip.manage`; uploading artwork additionally requires `uploads.manage`.

## Delivered

- Database-backed tiers: name, positive unique level number, 1–3650 valid days,
  active state, all requested privilege checkboxes and categorized asset links.
- No fixed five-tier ceiling. Tier listing is paginated in batches of 50.
- Tiers / Artwork / Members tabs using the portal's existing layout and colors.
- Direct upload via the existing `/api/uploads` service (no duplicated file path).
  Gifts still require price, Sender XP and Receiver XP. Video cards require posters.
- Admin grant/replace and revoke by public user ID, audit records, expiring asset
  assignments. Existing purchased/admin-granted assets are not overwritten.
- Membership expiry checked on authenticated mobile reads and reconciled each
  minute by the custom server. Assignment expiry independently protects access.
- `/api/v1/users/me/vip` returns `data.vip` or null, including tier, level,
  ISO startsAt/expiresAt, configured privilege keys and signed artwork URLs.
- Legacy numeric memberships are not silently migrated into a guessed duration.
  Grant a configured tier explicitly. No wallet charge or VIP purchase flow added.

The duplicated “VIP Gift / VIP Gifts” item is one VIP_GIFTS capability. Maximum
valid days is a validation safety bound, not a limit on how many tiers exist.
VIP tier changes do not extend current expiry. Re-grant replaces membership from
the current server time, not from the previous expiry. Linked assets synchronize
on the member's next authenticated API request. Expiry/revoke removes only
VIP_TIER assignments; it never deletes uploaded media or independently owned props.

## Important: configured privileges versus runtime behavior

This release delivers configuration and expiring membership/artwork grants.
It does NOT make every checkbox a completed runtime feature. The editor marks
non-artwork capabilities as requiring runtime integration.

- Artwork ownership uses existing props; the user can equip eligible props.
  Automatic equipping is intentionally not performed (preserves their choices).
- Name highlighting, emoji UI, VIP logo/data-card placement, invisible entrance,
  gift-avatar rendering and GIF-cover behavior require mobile contract integration.
- Anti-mic-ban, anti-kick and room anti-lock are recorded but are NOT yet enforced
  across all Socket.IO/REST moderation paths. Platform bans, forced logout,
  safety moderation and private/paid access must always prevail, as approved.
- Forbidden-follow enforcement, ranking-priority rules and level-boost execution
  are not connected yet. XP multiplier/track choice and ranking interpretation
  await product answers. No scores, XP or earnings are fabricated.
- VIP gift linkage currently grants an asset entitlement, not exclusive gift-send
  enforcement across wallet/backpack/multi-send. That cross-route work is pending.
- Exclusive customer service and event customization are capability flags, not
  new support chat or event fulfillment systems.

The mobile client must not treat the configured list as proof of implemented
server enforcement. Existing auth/profile `vipLevel` remains compatibility data;
fetch this new endpoint for timed membership state, and do not use cached numeric
VIP levels to authorize privileges. Full identity/socket serialization integration
and expiry-aware client refresh are still required.

## Operations

Apply `20261009090000_vip_management`, generate Prisma, restart node server.js.
Local migration has been applied. No existing VIP levels or accounts were seeded
or altered by migration. Current member table shows latest 100 records; asset
picker shows latest 1000 active matching assets. Expanded search/filter UI is a
follow-up for larger catalogues.
