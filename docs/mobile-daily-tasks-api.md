# Mobile daily tasks API

All endpoints require the mobile Bearer session and use the common response and
session-error envelopes.

## Overview

```http
GET /api/tasks/daily
Authorization: Bearer <sessionToken>
```

The response is fully server-driven and contains the wallet coin balance,
UTC-day reset countdown, seven-day sign-in streak, optional featured and weekly
tasks, and ordered categories with their task instances. Supported task states
are `claim`, `progress`, `completed`, and `locked`.

Definitions and user/period instances are stored separately. The initial
catalogue includes `SIGN_IN`, `ROOM_WATCH`, `SEND_GIFTS`, `LIVE_GO_LIVE`, and
weekly `TOP_SUPPORTER`. Administrators can change active definitions without
rewriting historical user instances.

Room watch and hosting progress is recorded by authenticated Socket.IO room
membership time. Gift task progress is reconciled from committed
`GiftTransaction` rows whenever the overview is loaded.

## Claims

Generic completed tasks use:

```http
POST /api/tasks/claim
Content-Type: application/json
Authorization: Bearer <sessionToken>

{ "taskId": "task-instance-id" }
```

`SIGN_IN` must use `POST /api/tasks/sign-in` with the same request body. A
successful sign-in also updates the user's UTC-day streak. Claims atomically
mark the instance completed, increment `coinBalance`, and create an immutable
`BONUS` wallet transaction keyed to the task instance. Concurrent or repeated
claims cannot credit the wallet twice.
