# Store prop gifting

## Endpoint

POST /api/store/{assetId}/gift with Authorization: Bearer <session token>.

```json
{"recipientPublicId":"USR-123","requestId":"client-generated-uuid"}
```

Generate requestId once per confirmed Give action; persist it until the outcome is known. Reuse the same ID, recipient and asset after a timeout. Do not generate a new ID inside each retry. Letters, digits, hyphens and underscores are accepted, up to 128 characters. A missing requestId is rejected.

```json
{"success":true,"data":{"giftId":"PGF-...","assetId":"AST-...","recipientPublicId":"USR-123","price":"40000","balance":"1958890","expiresAt":"2026-10-20T00:00:00.000Z","permanent":false}}
```

All money values are strings. Replay returns the original successful response, including the original balance snapshot; refresh wallet separately for the latest balance.

## Rules

- Sender pays; recipient receives the prop. Sender inventory is untouched, including when the sender already owns the item.
- Active store-visible STORE props only, including Room Frames. Non-prop catalogue assets cannot be given through this endpoint.
- Existing active recipient ownership is rejected; expired ownership is replaced using the item's configured duration. No duration means permanent.
- Self-gifting is rejected for store props; this does not change room gift self-gifting rules.
- Account restrictions and blocks in either direction are enforced by the server.
- No Diamond conversion or gifting XP is awarded for a store prop purchase.
- Debit, zero-Coin recipient ledger entry, entitlement, gift record, audit, notification and outbox are transactional. No ledger or entitlement is written on a failed request.

## Errors

Existing error shape: {success:false,error:{code,message}}.

STORE_ITEM_NOT_FOUND, INSUFFICIENT_COINS, PROP_ALREADY_OWNED_BY_RECIPIENT, CANNOT_GIFT_SELF, RECIPIENT_NOT_FOUND, RECIPIENT_UNAVAILABLE, VALIDATION_ERROR and normal session errors.

IDEMPOTENCY_CONFLICT means the same sender reused requestId for a different item or recipient; do not retry with changed payload. RETRY_REQUIRED means retry the exact same requestId and body after a concurrency conflict.

## Notifications

Recipient receives an in-app Notification of type PROP_GIFT, with an action targeting MY_PROPS and containing giftId and assetId. It remains available in notification history while offline. Device push is excluded as requested.

The durable realtime outbox emits props:granted to the recipient:

```json
{"success":true,"data":{"giftId":"PGF-...","assetId":"AST-...","category":"FRAMES","expiresAt":null,"recipientPublicId":"USR-123"}}
```

Refresh My Props on receipt; tolerate duplicate realtime delivery and deduplicate animations by giftId. Refresh inventory and notification history after reconnect. The item is not automatically equipped.

## Verification

Test success, insufficient funds, both block directions, self-recipient, banned/deleted recipient, recipient already owns the prop, expired ownership, sender already owns the item, repeated request, changed-payload retry and network timeout/reconnect. Verify sender pays once and recipient Coins remain unchanged.

## Deployment

Apply migration 20261019040000_store_prop_gifts, regenerate Prisma, rebuild and restart. Local focused unit tests and isolated migration checks are provided. Production and real-device verification have not been performed. No historical balances or grants are changed.
