# Room Rocket — implementation handoff

Implementation date: 2 November 2026. Local implementation; not deployed or verified on physical phones in this task. No existing balances, gifts, rewards or history were changed. No historical gift backfill.

## Administration and lifecycle

Room Management > Room Rocket uses separate `rocket.view` and `rocket.edit` permissions. The feature starts disabled, with no automatic reward configuration. Admin configures exactly three ordered stages, positive Coin targets, HTTPS thumbnail/preview/launch media, optional low-resolution media and poster, animation duration, reward groups and rules.

The first season begins when Admin enables a valid configuration. Admin chooses its UTC end timestamp and a repeat interval (`repeatDays`, 1–366). Subsequent seasons repeat that duration automatically. This is an explicit fixed-day interval, not a calendar-month salary cycle. Missed inactive seasons are skipped without backfilling gifts or rewards. Stage/reward/rules changes apply to the next season. Disable takes effect immediately for counting and activity reads; already-earned payouts still complete. Re-enabling within a season resumes that season.

## Scoring and rewards

- Only committed, paid audio-room gift Coin values count. Normal/Lucky gifts and combo taps use each saved recipient transaction's recorded value once. No catalog-price recalculation; no Lucky winnings, backpack gifts, live-video gifts or historical contributions.
- Fuel and contribution allocation happen in the gift transaction. Overflow retains the sender attribution and can launch several stages. Stage 3 stays completed at 100%; excess after completion does not restart it.
- TOP 1–3 rank by stage contribution descending, with stable user identity as the tie-break. Active, non-deleted, non-banned real accounts qualify. These recipients receive the configured reward bundle.
- IN ROOM uses current socket presence leases and room membership at launch, excludes TOP 1–3, official system accounts and invisible-entry accounts, and samples unique users. Owner is eligible. Each selected person receives **one randomly selected reward** from that stage's IN ROOM list; choices are uniform. If fewer eligible users exist, all qualify.
- Launch creation has a unique room/season/stage key. Winner/reward snapshots are immutable. Durable payout work runs one recipient per transaction with a saved completion marker. Repeated workers/retries cannot repeat committed payouts. Rewards may show PENDING briefly after the launch animation.
- COINS credit a `ROCKET_REWARD` ledger entry titled `Rocket reward`. PROP rewards extend a timed assignment from max(now, expiry), preserve permanent access and equipped state. GIFT rewards increment backpack quantity.
- Refunds correct only the original gift's allocation remaining in the current unlaunched stage, floored at zero. Completed launches and paid rewards stay unchanged. Previous-season refunds do not reduce a new season.

## Mobile endpoints

Both use existing mobile Bearer/session/device/version checks and room access checks. Caller must be connected to the LIVE room, including owners. Responses are `Cache-Control: private, no-store`; per-route rate limit is 120 requests/minute.

`GET /api/v1/audio-rooms/{roomId}/rocket-activity`

```json
{"success":true,"data":{"roomId":"ROOM-123","serverTime":"2026-11-02T12:00:00.000Z","campaign":{"id":"ROCKET-uuid","title":"Room Rocket","rules":"Send gifts to fill the rocket","endsAt":"2026-11-17T00:00:00.000Z"},"progress":{"stageId":"LV-2","level":2,"currentCoins":"92000","targetCoins":"150000","percentage":61,"revision":37},"stages":[{"id":"LV-2","level":2,"title":"Rocket LV.2","targetCoins":"150000","completed":false,"thumbnailUrl":"https://media.example/rocket.png","previewUrl":null,"mimeType":"video/mp4","animation":{"mediaUrl":"https://media.example/launch.mp4","mimeType":"video/mp4","lowResolutionMediaUrl":null,"posterUrl":null,"durationMs":5000,"avatarTrack":null},"inRoomWinners":10,"rewards":{"top1":[{"rewardId":"LV-2-top1-1","type":"COINS","amount":"5000","name":"Coins","iconUrl":null,"text":"5000 Coins"}],"top2":[],"top3":[],"inRoom":[]}}],"topContributors":[{"rank":1,"totalCoins":"40000","user":{"publicId":"USR-200","name":"Ali","profileImage":null}}]}}
```

The actual stages array always contains all three stages. Coin amounts are decimal strings; percentage is an integer 0–100. Contributor identity includes publicId, name, profileImage, the USER progression level and a signed frameUrl for a valid equipped frame (null when absent). Prop rewards use `type: "PROP"`, `category` (e.g. FRAMES), public `assetId`, and `amount` as days; GIFT amount is backpack quantity. Internal asset/user IDs are never returned. Optional artwork can be null.

`GET /api/v1/audio-rooms/{roomId}/rocket-activity/results?campaignId=ROCKET-uuid&stageId=LV-1&limit=20`

```json
{"success":true,"data":{"title":"Rocket LV-1 rewards","launchId":"LAUNCH-uuid","payoutStatus":"PAID","myRewards":[],"recipients":[{"rank":1,"group":"top1","user":{"publicId":"USR-200","name":"Ali","profileImage":null},"rewards":[{"rewardId":"LV-1-top1-1","type":"COINS","amount":"5000","name":"Coins","text":"5000 Coins","iconUrl":null}]}],"nextCursor":null}}
```

Limit defaults20/max50. Pass nextCursor unchanged for the next page. It is bound to a launch; changing campaign/stage requires discarding it. Pages follow immutable winner order; `myRewards` covers the caller independently of pagination. IN ROOM recipients have null rank and group `inRoom`. Deleted/inactive identities become null without erasing reward history. Before launch, results are empty with payoutStatus `NOT_LAUNCHED`; committed launches are `PENDING` until all recipients finish, then `PAID`.

Activity disabled: 409 `ROCKET_DISABLED`; disconnected caller: 403 `JOIN_ROOM_FIRST`; malformed parameters: 422 `VALIDATION_ERROR`; rate-limit: 429 `RATE_LIMITED`. Existing room/auth errors remain authoritative. In-room draw presence failure rolls back the triggering gift with `ROCKET_PRESENCE_UNAVAILABLE`; retry the same gift request key, never a new one.

## Join and realtime

The socket audio-room join acknowledgement contains `rocketActivity: { enabled, campaignId, stageId }`; disabled is `{enabled:false}`. Hide the button when missing/disabled. Reconnect/refetch activity for recovery.

Room events use `{success:true,data:{...}}`:

- `audio-room:rocket:progress`: roomId, campaignId, stageId, level, currentCoins, targetCoins, percentage, revision, topContributors. Durable dirty state is coalesced approximately every500ms; accept only newer room revisions. Revisions continue upward across seasons. Slow workers can exceed this cadence; HTTP is the recovery source.
- `audio-room:rocket:launch`: roomId, launchId, eventId, campaignId, stageId, level, topContributor and animation. Event delivery is retryable: deduplicate eventId on the app. Atomic persistence guarantees one logical launch, not exactly-once network delivery. Next-stage progress follows through the coalescing worker. Refetch results after launch and while payoutStatus is PENDING.
- Coin payouts use the existing authoritative `wallet:updated` balance/revision event through the wallet database trigger. `props:granted` includes assetId/expiresAt/launchId; `backpack:updated` includes giftId/launchId. Treat these as refresh signals. In-app notifications navigate to `ROOM_ROCKET_RESULTS` with roomId/campaignId/stageId.

Use serverTime to establish a countdown offset; at campaign end refetch instead of locally granting rewards/resetting authoritative fuel. Launch avatarTrack is currently null; apps may show the top contributor using their default placement.

## Deployment and verification

Required additive migration: `20261102200000_room_rocket`. Run `npx prisma migrate deploy`, `npx prisma generate`, build and restart the custom server so both progress and payout workers run. Do not seed/backfill historical gifts. Existing confirmed-wallet-event migrations must already be present. Keep the switch off until configuration and QA are ready.

Local validation: isolated PGlite migration/unique-launch/rollback test; unit coverage for exact Coin precision, carryover/final completion, duplicate gifts, refund behavior, winner eligibility, retry-safe payouts, timed/permanent props, backpack updates, season rollover, result pagination and membership checks. Production Next build and focused lint passed during implementation.

Still required after deployment with dedicated QA accounts: two phones observe fuel and one launch animation, all reward delivery/refetch flows, real socket reconnect, same-room simultaneous gifts, concurrent payout workers, expiration rollover and gift latency under sustained Lucky load. These were not tested on production or physical devices here.
