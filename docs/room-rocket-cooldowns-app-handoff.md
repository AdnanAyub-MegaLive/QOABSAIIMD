# Room Rocket pauses and repeat cycles

## Server behavior

- After Level 1 or 2 launches, the next level is shown immediately, but cannot launch for 180 seconds. Paid gifts during this pause count toward it. Overflow keeps its sender attribution and waits for the following level.
- After Level 3 launches, the room waits 180 minutes by default, then resets to Level 1 with zero progress and a new cycle. Gifts sent during this final wait do not count, including jobs processed after the deadline. Excess coins from the final launch do not carry into the new cycle.
- The worker advances countdowns even without another gift or an open activity screen. Existing campaign/season boundaries still apply.
- Portal: Room Management → Room Rocket → Reset after top-level launch (minutes), range 1–10080. Changes apply to subsequent top-level launches; an already scheduled reset keeps its deadline. Targets and rewards retain their existing next-season configuration behavior.

## Snapshot and progress socket

`GET /api/v1/audio-rooms/{roomId}/rocket-activity` includes these additional fields in `progress`. The same fields appear at the top level of `audio-room:rocket:progress`:

```json
{
  "cycle": 0,
  "cooldownUntil": "2026-11-11T12:03:00.000Z",
  "resetAt": null,
  "queuedCoins": "0"
}
```

- `cycle`: zero-based, increments on each top-level reset within a campaign.
- `cooldownUntil`: UTC timestamp or null. Display the three-minute launch pause. Continue showing server progress and accepting normal gifts. A full bar during this pause is **not** a completed launch.
- `resetAt`: UTC timestamp or null. Display the final-level reset countdown and explain that gifts do not count toward Rocket until reset.
- `queuedCoins`: string amount awaiting allocation after the current level fills. Already credited `currentCoins` excludes this amount; do not add it again to current-level standings.
- Use `serverTime` to offset the local clock. Countdown expiry should refresh the snapshot, not locally launch, award rewards, or reset the level.
- Continue using increasing `revision` to discard stale progress. Use campaign plus cycle when identifying a flight sequence. `stages[].completed` only becomes true after the launch, not merely when its bar reaches 100% during a pause.

`audio-room:rocket:launch` retains its unique `eventId`/`launchId`, and adds `cycle`, `cooldownUntil`, and `resetAt`. Deduplicate animations using `launchId`, not campaign plus level, since levels repeat. Room join summaries also include `cycle`.

## Results

The existing results endpoint accepts optional `cycle` or `launchId` alongside `campaignId` and `stageId`. Pass the launch event's `launchId` for its result sheet, or the snapshot's `cycle` for current-cycle results. With neither supplied, the latest launch of that level is returned for compatibility.

Results include `cycle` and `launchId`. Pagination cursors remain pinned to that launch even if another cycle launches while the sheet is open. Reward notification actions also carry `cycle` and `launchId`.

## Deployment

Run the normal Droplet deployment script; it applies the Rocket cycle/credit migration and regenerates Prisma. Existing launches remain paid once. Completed legacy rockets receive a reset deadline three hours after their original top launch; overdue ones reset on the next worker tick. No event-page regeneration is needed.
