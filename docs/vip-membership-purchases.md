# VIP ownership and mobile purchases

Status: implemented locally; migration and deployment required. No production data changed.

Ledger follow-up: also apply `202610150002_vip_purchase_ledger_type` before enabling purchases and regenerate Prisma. Wallet entries have type `VIP_PURCHASE`, title/typeLabel `VIP purchase`, and the tier name as description. Mobile must add `VIP_PURCHASE: "VIP purchase"` to its local type-label map (or render the server title/typeLabel). No mobile source is included in this repository.

## Portal

VIP Management → Tiers → Create/Edit: upload artwork directly beside each selected visual privilege with **Upload & select**. Existing artwork may still be selected. Secure upload validation, CDN eligibility and upload permissions are unchanged. Set membership validity once; benefits use the selected membership's expiry, not separate per-item durations.

Set Coin price to a positive integer to offer a tier for purchase. Blank price means grant-only. Existing tiers migrate with no price and are not sold accidentally. Active tiers appear in the mobile catalogue. Admin grants still cost no Coins and select the granted tier, retaining other owned tiers. Admin Revoke revokes all owned VIPs for that user and clears the active membership.

## Mobile API

All calls require the existing Bearer session.

- `GET /api/v1/vip`: `data.tiers[]` includes id, name, level, validDays, coinPrice (decimal string or null), purchasable, privileges, owned, expiresAt, selected, and artwork with signed URLs, MIME, poster and version metadata.
- `POST /api/v1/vip`, body `{ "action":"PURCHASE", "tierId":"..." }`, required `Idempotency-Key` header (8–128 characters). The server debits configured Coins and grants ownership in one transaction. Response `data` includes tierId, expiresAt and coinBalance.
- `POST /api/v1/vip`, body `{ "action":"SELECT", "tierId":"..." }`. Only active, owned, unexpired VIPs may be selected. Only one selected VIP's privileges/benefits apply at a time.
- Existing `GET /api/v1/users/me/vip` continues returning the selected active membership.

Buying the same owned VIP extends from its expiry. If expired or revoked, validity starts now. Buying another VIP preserves both ownerships with independent expiry dates; it does not replace a still-valid selection. If there is no valid selection, the purchased VIP becomes active. Inactive owned VIP validity continues counting down; selecting does not restart or pause it. No refunds, prorating, XP or automatic switching on expiry are introduced.

Persist a purchase key before sending. A retry of the same key/tier returns the original result without another debit; a different tier with that key returns `IDEMPOTENCY_CONFLICT`. Refresh wallet/catalogue after success, selection or reconnect. Backend rejects insufficient Coins, disabled/grant-only tiers and unavailable ownership. App should show all owned options and an explicit Select button, with prices and validity before purchase.

## Migration

`202610150001_vip_ownership` adds tier pricing, ownership and purchase records. Existing VipMembership rows are copied unchanged, preserving expiry/revocation. The existing membership remains the selected-membership projection, keeping current permission consumers compatible. No wallet balances are migrated or changed.

Apply migrations before starting the updated portal; regenerate Prisma and rebuild. Verify same-tier renewal, two-tier ownership and switching, insufficient funds, concurrent retries, expired ownership, and free admin grants in staging before enabling paid tiers in production.
