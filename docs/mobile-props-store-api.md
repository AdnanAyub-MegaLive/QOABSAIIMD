# Mobile Store and My Props API

This document is the handoff contract for the React Native application.
Every mobile endpoint requires:

```http
Authorization: Bearer <sessionToken>
```

All successful responses use `{ "success": true, "data": ... }`; errors use
`{ "success": false, "error": { "code": "...", "message": "..." } }`.

## Ownership model

Catalog visibility does not mean ownership. An item can be visible and locked.
A user can apply only an active entitlement they own. Ownership sources are:

- `ADMIN`: manual Super Admin grant.
- `STORE`: purchased with the user's coin balance.
- `VIP`: automatically unlocked from `vipLevel`.
- `SVIP`: automatically unlocked from cumulative `totalTopUp`.
- `ACTIVITY`: granted by the trusted event/activity backend.

Ownership may be permanent (`expiresAt: null`) or time-limited. Expired items
must not be shown as usable. Only one item per equippable category can be active
at once.

Equippable categories are `FRAMES`, `ENTRANCES` (shown as Entrance Strip in
the portal), `RIDES`, `TAIL_LIGHTS`, `BADGES`, `CHAT_BOXES`, and
`ROOM_BACKGROUNDS`. `GIFTS` are catalog/ownership items but
are not profile props. `BANNERS` are marketing content and are never owned.

## Store catalog

```http
GET /api/store
GET /api/store?category=FRAMES
```

Response:

```json
{
  "success": true,
  "data": {
    "balance": "12500",
    "vipLevel": 3,
    "totalRecharge": "80000",
    "assets": [
      {
        "id": "AST-ABC123",
        "name": "Gold Ring",
        "category": "FRAMES",
        "url": "https://...",
        "distribution": "STORE",
        "price": "2500",
        "minimumVipLevel": null,
        "minimumRecharge": null,
        "defaultGrantDurationMinutes": null,
        "owned": false,
        "ownership": null,
        "equipped": false,
        "canPurchase": true,
        "lockedReason": null
      }
    ]
  }
}
```

VIP, SVIP, activity, and admin-only assets may be present but locked. Display
`lockedReason`; do not show a Buy button unless `canPurchase` is true.

## Purchase

```http
POST /api/store/AST-ABC123/purchase
```

No request body is required. The debit, purchase ledger, and entitlement are
created atomically.

```json
{
  "success": true,
  "data": {
    "purchaseId": "PUR-...",
    "assetId": "AST-ABC123",
    "price": "2500",
    "balance": "10000",
    "expiresAt": null,
    "permanent": true
  }
}
```

Relevant errors: `STORE_ITEM_NOT_FOUND`, `PROP_ALREADY_OWNED`,
`INSUFFICIENT_COINS`.

## My Props

```http
GET /api/users/props
```

This endpoint returns only active props the caller owns. It also synchronizes
new VIP/SVIP entitlements.

```json
{
  "success": true,
  "data": {
    "props": [
      {
        "id": "AST-ABC123",
        "name": "Gold Ring",
        "category": "FRAMES",
        "url": "https://...",
        "source": "STORE",
        "acquiredAt": "2026-07-30T10:00:00.000Z",
        "expiresAt": null,
        "permanent": true,
        "equipped": true
      }
    ],
    "equipped": {
      "FRAMES": {
        "assetId": "AST-ABC123",
        "url": "https://..."
      }
    }
  }
}
```

Signed media URLs expire, so refresh My Props/Store rather than persisting the
URL as permanent application state.

## Equip or remove

Equip an owned prop:

```http
POST /api/users/props/equip
Content-Type: application/json

{ "assetId": "AST-ABC123" }
```

Remove the active prop for a category:

```json
{ "assetId": null, "category": "FRAMES" }
```

Relevant errors: `PROP_NOT_FOUND`, `PROP_NOT_OWNED`,
`PROP_NOT_EQUIPPABLE`.

Equipped frames, badges, and room backgrounds are resolved by the backend in
public user/search/conversation/audio-room responses. Owning an item does not
apply it automatically.

## Real-time events

- `props:granted`:
  `{ assetId, category, source, expiresAt }`
- `props:updated`:
  `{ category, assetId }`, where `assetId: null` means removed.

On `props:granted`, refresh Store and My Props. On `props:updated`, refresh
cached public-profile decoration.

## Trusted activity/event reward API

This endpoint is server-to-server only. Never embed its key in React Native.

```http
POST /api/internal/props/grant
x-internal-api-key: <INTERNAL_REWARD_SECRET>
Content-Type: application/json

{
  "userId": "USR-2048",
  "assetId": "AST-EVENT01",
  "reference": "summer-event:mission-4",
  "permanent": true
}
```

For a timed reward, replace `permanent` with `durationMinutes`. The event
backend must verify completion before calling this endpoint.

## Admin upload behavior

The portal upload modal supports:

- Buy from Store: coin price.
- VIP reward: minimum VIP level 1–5.
- SVIP/recharge reward: minimum cumulative recharge.
- Activity/event only.
- Super Admin grant only.
- Store visibility.
- Permanent or timed default ownership.

Manual user assignment remains available as a Super Admin override for every
distribution type.
