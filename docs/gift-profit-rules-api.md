# Gift settlement and agency rules

## Platform rules

`GET /api/platform/rules` requires a mobile bearer session and returns the
currently active percentages. The application should use this response for
display only; the backend always recalculates and settles the authoritative
amount.

```json
{
  "success": true,
  "data": {
    "profitSplit": {
      "hostPercent": 40,
      "agencyPercent": 20,
      "companyPercent": 40,
      "normalUserReusablePercent": 40,
      "normalUserCompanyPercent": 60,
      "normalUserWithdrawable": false,
      "hostRequiresAgency": true,
      "version": 1,
      "updatedAt": "2026-07-31T12:00:00.000Z"
    }
  }
}
```

## Send and settle a gift

First load the consumable gift catalog:

```http
GET /api/gifts/catalog
Authorization: Bearer <sessionToken>
```

The response contains `Classic`, `Premium`, and `VIP` category groups plus a
flat `gifts` list. Each gift contains `id`, `name`, `details`, `tags`,
`category`, `mimeType`, `coinPrice`, and a signed `mediaUrl`. The picker should
render the media according to `mimeType`, let the user choose a quantity from
1 to 999, show `coinPrice × quantity`, and require explicit confirmation.

`POST /api/gifts/send` requires a mobile bearer session.

```json
{
  "recipientId": "USR-2048",
  "giftId": "AST-68A379FB4345",
  "quantity": 5,
  "roomId": "ROOM-7F30A921B8C4"
}
```

The backend loads the active gift by `giftId` and authoritatively calculates
`coinPrice × quantity`. Client-provided names or coin totals are not accepted,
preventing price manipulation. `roomId` is optional for gifts sent outside a
room; when supplied, it must refer to a live room.

After settlement, the backend emits `gift:received` to the audio-room channel
(or directly to the recipient when no room is supplied). Its payload contains
the sender, recipient, transaction ID, quantity, unit/total price, MIME type,
and signed media URL so every client can play the animation immediately.

## Room gift history and leaderboard

Authenticated clients can load a room's persisted gift total and newest-first
history with:

```http
GET /api/audio-rooms/{roomId}/gifts?limit=20&cursor=<transaction-cuid>
Authorization: Bearer <sessionToken>
```

`limit` defaults to 20 and is capped at 50. The response includes
`totalCoins`, `nextCursor`, sender/recipient identities, quantity, total coins,
and the gift's signed `mediaUrl`. An empty room history returns `totalCoins` as
`"0"` and an empty `transactions` array.

The `audio-room:join` acknowledgement includes the room's top three
`topGifters` and `topReceivers`. After every committed room gift, the server
broadcasts the refreshed lists to the complete room as
`audio-room:gift-leaderboard`. Leaderboards are computed from committed gift
transactions; clients must not calculate or submit authoritative totals.

The complete sender or receiver ranking is available with page-based offset
pagination:

```http
GET /api/audio-rooms/{roomId}/gift-ranking?type=senders&page=1&limit=20
Authorization: Bearer <sessionToken>
```

`type` defaults to `senders` and must be `senders` or `receivers`. `page` defaults to 1;
`limit` defaults to 20 and is capped at 50. Entries contain an absolute `rank`,
public user identity, and numeric `totalCoins`. Equal totals use the internal
user ID as a stable secondary order so entries do not move unpredictably
between pages.

Every sender, linked-user recipient, top-three entry, and ranking entry includes
that user's own `frameUrl`, resolved from their currently equipped `FRAMES`
asset as a public-display signed URL. Historical talent-only transactions keep
`recipient: null` when no linked user exists.

Host recipients must have role `HOST` and an active agency. Their settlement
is credited to a salary balance and the agency commission balance. Normal
users receive only the configured reusable percentage in their coin balance;
they receive no salary balance and cannot withdraw it.

The success response includes `grossCoins`, `hostSalaryCoins`, `agencyCoins`,
`companyCoins`, `reusableCoins`, and `policyVersion`, all derived and committed
atomically by the backend.

Possible business errors include `INSUFFICIENT_COINS`, `GIFT_NOT_FOUND`,
`ROOM_NOT_LIVE`, `HOST_AGENCY_REQUIRED`, `USER_NOT_FOUND`, and
`VALIDATION_ERROR`.

## Administration

Portal administrators manage percentages and one-agency-per-host membership
at `/platform-rules`. Every rules or membership change is written to Audit
Logs. Existing gift settlements retain their original percentage snapshot
when the active policy changes.
