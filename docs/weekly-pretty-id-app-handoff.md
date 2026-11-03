# Weekly Pretty IDs — backend and app handoff

## Delivery status

Implemented locally. Requires migration, generated Prisma client, deployment and Portal configuration before use. No production records, balances or rewards were changed. Mobile UI integration and real-device verification are still required.

## Portal configuration

User/Sender → Special IDs → Special ID assignments → **Weekly Pretty IDs** (permission `users.specialIds`). Configure five levels, recharge thresholds, repeated-character patterns, maintenance coins and validity days. Default qualification thresholds: 1M/5M/10M/15M/25M, respectively 7/6/5/4/3 characters. Default validity is 30 days; maintenance defaults to zero (no renewal offer) until explicitly configured.

Saving schedules the policy for the next Monday 00:00 UTC. The first configured week is the activation cutoff; no previous weeks are processed. Saving again before that Monday replaces the scheduled policy, with an audit entry. Current weeks and existing granted terms remain unchanged. Disabling is also effective next Monday. Manual official grants use the latest saved level terms, including a scheduled policy, independently of weekly qualification being enabled.

## Recharge and weekly allocation

- Week = Monday 00:00 UTC inclusive to following Monday exclusive.
- Completed `COIN_TOP_UP` credits linked to a completed top-up order count its paid `baseCoins`; promotional bonus coins do not count.
- Completed personal `TRANSFER_RECEIVED` credits count only with matching completed business `TRANSFER_SENT` debit proof for the same reference and amount (reseller recharge).
- Original credit creation time determines the week. Pending/failed/reversed credits and failed orders do not qualify. Unknown/unlinked historical credits are not guessed into eligibility. Administrative adjustments, gifts, game wins and reward credits do not count.
- At close, the worker grants one entitlement at the highest threshold reached by `rechargeCoins - accepted maintenance allocations`. It processes 50 accounts per minute, begins no earlier than five minutes after week close, and resumes after restarts. Grants are unique per user/week and include a durable notification.
- There is no wallet deduction for qualification or maintenance. The allowance is a separate eligibility calculation.
- Example: 28M recharge minus an accepted 3M renewal leaves 25M and qualifies for one 3-character entitlement. With 25M recharge and the same renewal, 22M remains and qualifies for a 4-character entitlement.
- Completed weekly grants and accepted renewals are not retroactively clawed back by later corrections. Future/remaining allowance is recomputed from current eligible ledger records, clamped to zero. This feature introduces no new refund mutation path.

## ID lifecycle

The account keeps its normal public ID permanently. Entitlements allow a code matching the configured length and pattern. Codes use A–Z and 0–9, are normalized to uppercase and are case-insensitive. Distinct pattern letters must map to distinct characters: BBBCCCC permits XXXZZZZ, 1113333 and XXX1111, but not XXXXXXX.

`UNCLAIMED` → `CLAIMED` reserves the code without expiry. `ACTIVATE` starts expiry on first use. Switching changes the formerly active Pretty ID to `OWNED`; its countdown continues. Only one ID is displayed at once. Switching back never resets expiry. Expired/revoked/replaced IDs cannot be reactivated. Reserved and unexpired owned codes are unavailable to other users. Existing historical grants retain their original terms; they are not retroactively assigned maintenance thresholds.

Existing fixed Special ID store purchases/VIP definitions remain a separate feature. Switching to those preserves owned Pretty IDs, but their own existing replacement rules remain. The legacy `POST /api/store/special-ids` grant claim now reserves an ID and returns `activationRequired`; the app must perform activation explicitly.

## Mobile endpoints

`GET /api/v1/users/me/pretty-ids` (also `/api/users/me/pretty-ids`). Existing mobile authentication/session/device checks apply. Response is private/no-store.

```json
{
  "success": true,
  "data": {
    "weekStart": "2026-11-09T00:00:00.000Z",
    "weekEnd": "2026-11-16T00:00:00.000Z",
    "serverTime": "2026-11-12T12:00:00.000Z",
    "enabled": true,
    "rechargeCoins": "28000000",
    "allocatedCoins": "3000000",
    "availableCoins": "25000000",
    "levels": [],
    "maintenanceOffers": [],
    "grants": [
      {
        "id": "grant-id",
        "pattern": "BBCCC",
        "durationMinutes": 43200,
        "level": 3,
        "source": "WEEKLY_RECHARGE",
        "maintenanceCoins": "3000000",
        "code": "XX111",
        "expiresAt": "2026-12-12T12:00:00.000Z",
        "status": "ACTIVE",
        "suggestions": []
      }
    ]
  }
}
```

`levels` contains the active week's five configured rows (`level`, `characters`, `thresholdCoins`, `pattern`, `maintenanceCoins`, `durationDays`). `maintenanceOffers` contains eligible unexpired owned/active IDs without a decision this week, ordered by maintenance amount then grant ID. Each offer includes `grantId`, `specialId`, `level`, `maintenanceCoins`, `durationMinutes`, `expiresAt`. Multiple offers can share the same allowance; display does not reserve it. Always refresh after a decision.

`POST /api/v1/users/me/pretty-ids` actions:

```json
{"action":"CLAIM","grantId":"grant-id","code":"XX111"}
```

Returns `assignmentId`, `normalId`, `specialId`, `expiresAt:null`, `activationRequired:true`, `active:false`. Retrying the same grant/code returns the reservation; a different code conflicts.

```json
{"action":"ACTIVATE","grantId":"grant-id"}
```

Returns `assignmentId`, `normalId`, `specialId`, `expiresAt`, `active:true`. Use the same action to switch between owned IDs. Repeating activation never extends validity. Treat switching as a desired-state operation: do not replay an older activation after the user deliberately selected another ID.

```json
{"action":"MAINTAIN","grantId":"grant-id","weekStart":"2026-11-09T00:00:00.000Z","accepted":true}
```

Returns `grantId`, `accepted`, `allocatedCoins`, `expiresAt`. Acceptance extends from the existing expiry by the grant's validity duration, once per ID/week. `accepted:false` records a decline and allocates `0`. The same decision is replay-safe even after week close; changing a recorded decision returns `IDEMPOTENCY_CONFLICT`. Missing/ignored decisions allocate nothing. A delayed first decision for a previous week returns `WEEK_CLOSED`. An expired, unactivated or revoked ID cannot be maintained.

## App integration

1. Refresh on opening this screen, completing a recharge, foreground/reconnect, and `pretty-id:updated`.
2. While the screen is visible, poll approximately every 10 seconds; GET is limited to 30/minute and POST to 20/minute per account. Recharge commits also schedule deduplicated `PRETTY_ID_MAINTENANCE` notifications with `action.screen = PRETTY_IDS`, `grantId`, and `weekStart`. These are post-commit hints: open the screen and refetch before offering a decision, since the allowance or expiry may have changed. GET recovers offers if notification delivery was interrupted.
3. For each returned maintenance offer, ask whether to allocate the stated weekly recharge allowance. Explain that **wallet coins are not deducted**. Show Yes/No once per grant/week; offline or dismissed prompts can remain pending until week end.
4. After Yes or No, refresh offers and remaining allowance. A declined low-level ID will not prompt again that week; later eligible offers can still appear. Never auto-accept.
5. Unclaimed entitlements show format, suggestions and custom input. Claimed IDs show an Activate button. Owned IDs show Switch. Display server expiry countdown continuously for both active and inactive owned IDs.
6. Activation emits the existing `special-id:assigned`; changes emit `pretty-id:updated` with `grantId`. Weekly grants use `notification:new` with `action.screen = PRETTY_IDS` and `grantId`. Socket delivery is a refresh hint; GET remains authoritative.

All amounts are decimal strings. Errors use `{success:false,error:{code,message}}`: validation 422, ownership/unavailable 409, `NOT_RENEWABLE`, `INSUFFICIENT_RECHARGE`, `WEEK_CLOSED`, `PRETTY_IDS_DISABLED`, `IDEMPOTENCY_CONFLICT` 409, rate limit 429, normal authentication failures. Never treat request failure as a decline.

## Deployment and verification

1. Apply `20261103190000_weekly_pretty_ids` with `npx prisma migrate deploy`.
2. Run `npx prisma generate`, rebuild and restart the portal.
3. Configure maintenance amounts and enable the next-week policy in the Portal. Migration alone does not enable grants.
4. Verify with dedicated QA accounts: claim without timer, first activation, switch away/back, decline, accept twice, concurrent offers competing for allowance, week boundary, and highest-level weekly grant. Verify wallets remain untouched by all Pretty ID operations.

Local tests cover UTC boundaries, large exact amounts, qualification after maintenance, recharge SQL against isolated PostgreSQL (PGlite), excluded credits, claim/activation/switching, duplicate and conflicting decisions, concurrent allocation and expired/foreign grants. Production and real-device verification are not claimed.
