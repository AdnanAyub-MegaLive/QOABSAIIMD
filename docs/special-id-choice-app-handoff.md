# Spec 206: owned Special IDs and automatic takeover

Available after deploying the backend and its data-repair migration. Existing Pretty ID CLAIM/ACTIVATE routes remain supported.

Bearer-authenticated `GET /api/v1/users/me/special-ids`:

```json
{
  "success": true,
  "data": {
    "items": [{
      "assignmentId": "assignment-id",
      "specialId": "0099999",
      "type": "LEGACY",
      "source": "PRETTY_ID",
      "status": "ACTIVE",
      "startsAt": "2026-11-03T12:00:00.000Z",
      "expiresAt": "2026-11-13T12:00:00.000Z",
      "durationMinutes": 14400
    }]
  }
}
```

The list contains unexpired, unrevoked ACTIVE/OWNED/CLAIMED assignments from all sources, active first. Keep `specialId` as a string to preserve leading zeroes. `expiresAt` may be null; `durationMinutes` is null for permanent assignments without a grant duration.

To select an ID, `POST` to the same route:

```json
{ "assignmentId": "assignment-id", "action": "USE" }
```

Success returns `{ "success": true, "data": <the active item in the same shape> }`. Refresh the list/profile after success. Business errors: `SPECIAL_ID_NOT_OWNED` (403), `SPECIAL_ID_EXPIRED` (409), `SPECIAL_ID_UNAVAILABLE` (409). Invalid input is 422; excessive requests are 429. Responses are private/no-store.

New assignments and switching keep prior valid IDs OWNED. Their timers continue running. An unactivated CLAIMED Pretty ID starts its original grant duration once, on first activation; switching never restarts it.

When an active ID expires or is revoked, the server chooses a valid owned/claimed ID, permanent/null expiry first, then latest expiry. With no eligible replacement, the normal ID returns. `profile:updated` is sent to the user's socket room with `{ success: true, data: { publicId, normalId, effectiveId, specialId, specialIdExpiresAt } }`; refresh profile and owned IDs on this event. The existing expiry event now carries the replacement identity when one exists.

The migration restores eligible REPLACED records to OWNED and activates a replacement where necessary. It does not revive expired IDs, override an existing holder, undo explicit REVOKED decisions, or extend expiration dates. Portal rows display OWNED as “Owned (inactive)”.

QA: switch between admin/purchased/Pretty IDs, verify timers stay fixed, expire/revoke the active ID and check takeover, confirm permanent IDs display/search/login correctly, and verify cross-account selection is refused. Baidi's `0099999` is restored only if it remains unexpired when the migration runs.
