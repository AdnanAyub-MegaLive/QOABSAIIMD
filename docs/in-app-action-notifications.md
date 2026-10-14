# In-app action notifications — first implementation

## Implemented

- Phone and Google signup: one welcome notification for a genuinely new account.
- Welcome text/enabled setting: Room Management → Notification Center, protected by
  `notifications.manage`, revision checked and audited. Existing users are not backfilled.
- Follow and follow-back: one notification per follower/recipient pair; unfollow/refollow
  cannot spam the recipient. Ordinary follows have no approval/rejection workflow.
- Reseller Coin top-up received and verified payment-provider recharge received.
- Diamond exchange completed, using actual debited Diamonds and credited Coins.
- Diamond transfer to reseller: sender confirmation and reseller receipt. Does not claim
  that external USD payment is already complete.
- Currency requests: submission, cancellation/refund, approval, rejection/refund,
  reseller redemption credit and verified manual payment completion.
- Agency membership: join request to owner, invitation to user, accept/reject to initiator.
  This is separate from applications to create an agency.
- Daily-task and live-target rewards after the reward is credited.
- Manual system/event announcements, either global or one selected user.
- Inbox pagination, unread count, individual read and mark-all-read.

## Delivery contract

No Firebase, FCM or OS push. Notifications persist in PostgreSQL. A custom-server worker
dispatches `notification:new` every two seconds after commit. Offline users read the inbox
on their next session. Dispatch is at-least-once; deduplicate by notification `id`.
`deliveredAt` is a dispatcher marker, not proof the device received/read it. The worker
resolves the recipient's current public ID, including USR/TLN transitions.

The existing raw socket payload is preserved (not wrapped in a new envelope):

```json
{"id":"NOT-…","type":"EXCHANGE","title":"Exchange completed","body":"100 Diamonds exchanged for 50 Coins.","action":{"screen":"WALLET","referenceId":"…"},"createdAt":"2026-10-14T00:00:00.000Z","readAt":null}
```

`action.screen` values currently: HOME, PROFILE, WALLET, TASKS, AGENCY_MEMBERSHIP.
Treat them as typed navigation hints, not executable URLs. Always authorize a destination
on opening it. Clients should gracefully show text if a destination is unsupported.

Bearer endpoints (both `/api/notifications` and `/api/v1/notifications`):
- GET `?limit=50&cursor=…`: `{success:true,data:{notifications:[],unreadCount,nextCursor}}`.
  Limits 1–100, newest first using createdAt/id keyset ordering.
- POST `/{notificationId}/read`: marks only an accessible notification read.
- POST `/read-all`: marks existing accessible notifications read, returns `updated,readAt`.

Account identity is token-derived. Private notifications are never broadcast globally.
They are not removed by the 30-day chat retention job.

## Still pending — do not mark the entire notification roadmap complete

- Followed-user live alerts and durable large-follower fan-out.
- VIP/prop expiry and advance expiry reminders.
- Agency creation applications and reseller application decisions.
- Dedicated salary-deposit hooks (salary configuration edits are not deposits).
- Friend requests, security/role changes, moderation, support and custom-background decisions.
- Automatic event schedules/results/rewards beyond manual announcements.
- Country/role announcement audiences and per-user notification preferences.
- Mobile rendering/navigation/unread integration and real-device verification.

Existing Coin-transfer financial retries are unchanged: deduplication is per committed
transfer reference, not a new financial idempotency implementation.

## Deployment

Apply migrations and regenerate Prisma Client before starting this code, then build and
restart `node server.js`/PM2. Existing notifications are marked dispatched by migration
so old announcements do not replay. No production deployment has been performed here.
