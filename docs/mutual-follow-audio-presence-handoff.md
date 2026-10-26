# Mutual follower Audio Room navigation

Implemented locally; not deployed or tested on phones. No migration required.

GET `/api/v1/users/{publicId}/profile` adds `data.user.joinablePresence`:
```json
{"type":"AUDIO","roomId":"0001","expiresAt":"2026-10-26T12:00:30.000Z"}
```
Otherwise null. Existing profile denial/authentication errors remain unchanged.
Successful responses use `Cache-Control: private, no-store`.

Both follow directions are required; friendship alone does not qualify. Blocks
in either direction, inactive/deleted/globally banned targets, unavailable rooms,
owner blocks and viewer room bans hide the hint. Discovery is conservatively
limited to PUBLIC rooms without passwords; private/paid rooms return null.

Presence comes from authenticated live sockets, not owned rooms or stale member
rows. Owners, seated members and audience use the same rule. Socket room join,
switch and leave immediately affect reads. Disconnect removes presence; the
Engine.IO heartbeat lease expires at 45 seconds (25-second ping + 20 timeout).
Hints expire within 30 seconds and never outlive the observed lease. Existing
sockets need to reconnect after deployment to acquire the new lease metadata.
Conflicting active sessions in different rooms return null deterministically;
no arbitrary room is selected. Multiple sockets in the same room are allowed.

App: hide the button on null/missing/expired hints. Refetch on tap, discard old
account responses, then use the returned roomId with the existing join flow.
Passwords, capacity, bans, payment and final admission checks remain authoritative.
No RTC ticket, password or participant list is returned. No Live Room changes.

Phone verification pending: mutual/one-way follows, unfollow/block, owner and
audience, switches/leaves/disconnect expiry, private/closed/banned rooms, duplicate
taps and switching logged-in accounts. No balances or historical records changed.
