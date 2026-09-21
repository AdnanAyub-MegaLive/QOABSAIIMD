# Mobile Socket.IO session events

The portal serves HTTP and Socket.IO from the same base URL. Registration and `POST /api/users/login` return `data.sessionToken`; keep it in secure device storage and use it for both the socket handshake and session-status request. Login accepts `{ "phone": "+923001234567", "password": "..." }`.

## React Native connection

Install `socket.io-client` in the React Native application and connect after login or registration:

```js
import { io } from "socket.io-client";

const socket = io(API_BASE_URL, {
  auth: { token: sessionToken },
  transports: ["websocket"],
});

socket.on("session:status", handleSessionState);
socket.on("account:banned", showBannedScreen);
socket.on("account:unbanned", removeBannedScreen);
socket.on("session:force-logout", logoutImmediately);

socket.on("connect_error", (error) => {
  if (error.message === "ACCOUNT_BANNED") showBannedScreen({
    success: true,
    data: {
      isBanned: true,
      banReason: error.data?.banReason ?? null,
      banExpiresAt: error.data?.banExpiresAt ?? null,
    },
  });
  if (error.message === "SESSION_REVOKED") logoutImmediately();
});
```

## Session status fallback

Call `GET /api/users/session/status` with `Authorization: Bearer <sessionToken>`. Successful socket events and the endpoint use this shape:

```json
{
  "success": true,
  "data": {
    "sessionVersion": 0,
    "forcedLogoutAt": null,
    "isBanned": false,
    "banReason": null,
    "banExpiresAt": null
  }
}
```

The app should keep the socket connected for immediate enforcement and call the status endpoint on cold start, foreground resume, and before entering protected screens. A timed ban emits `account:unbanned` when it expires. Force logout and password reset emit `session:force-logout`, increment `sessionVersion`, then disconnect the socket.

## Audio-room reactions

An authenticated socket that has joined an audio room may emit:

```text
audio-room:reaction:send
```

```json
{
  "roomId": "ROOM-123",
  "reactionId": "gif_7",
  "requestId": "a-client-generated-unique-id"
}
```

The server accepts only `gif_0` through `gif_21`. The sender must be the room
owner or occupy a persisted room seat. Android must not send a sender or seat
identity; the portal resolves both from the authenticated socket and database.
`gif_0` is dice and receives one server-generated value from 1 through 6.

Success acknowledges only the stable IDs:

```json
{
  "success": true,
  "data": {
    "eventId": "REACTION-123",
    "requestId": "a-client-generated-unique-id"
  }
}
```

The portal broadcasts `audio-room:reaction` to the complete room, including the
sender. The payload contains `eventId`, `requestId`, `roomId`, server-resolved
`senderId` and `seatId`, `reactionId`, `kind`, optional `diceValue`, and
`createdAt`. Reusing a request ID briefly returns the original acknowledgement
without another broadcast or dice roll. Reactions are rate limited, ephemeral,
not persisted, and not replayed after reconnect. Current errors are
`REACTION_SEAT_REQUIRED`, `REACTION_NOT_ALLOWED`, and
`REACTION_RATE_LIMITED`.
