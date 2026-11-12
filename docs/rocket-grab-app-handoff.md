# Spec 207 — Rocket grab and final winners

Deploy the `20261112210000_rocket_grab` migration with the Portal. Existing launches retain their recorded winners and payout state; only new launches open a grab window.

`POST /api/v1/audio-rooms/{roomId}/rocket-activity/launches/{launchId}/grab`, Bearer authenticated, body `{}`.

Response: `{ success: true, data: { launchId, cycle, grabbed: true, grabClosesAt, myRewards: [...], recipients: [...] } }`. Rewards and recipients use the existing results endpoint shapes. A successful tap does not guarantee a reward if all slots are already claimed. TOP 1–3 may tap but keep only their existing top rewards and do not consume in-room slots. Duplicate taps return `409 ROCKET_GRAB_ALREADY`; reconcile using results after a lost response.

Eligibility requires a currently leased Socket.IO presence in the room, positive database room membership, an active eligible account, and no INVISIBLE_ENTRY privilege—the same rules as the previous in-room draw. First valid in-room grabbers receive one reward each, chosen randomly from the launch's in-room reward options. Slot assignment and duplicate detection are serialized by a launch row lock.

Errors: `409 ROCKET_GRAB_ALREADY`, `409 ROCKET_GRAB_CLOSED`, `403 ROCKET_GRAB_NOT_IN_ROOM`, `404 ROCKET_LAUNCH_NOT_FOUND`. Presence service failures remain retryable 503 responses; excessive requests can return 429.

The existing `audio-room:rocket:launch` payload additionally includes `grabWindowSeconds`, `grabClosesAt` (UTC deadline), and `inRoomWinners`. Default window: 30 seconds from launch creation. Configure it on the Rocket settings page (10–300 seconds); validation requires enough time for the animation, five seconds of countdown/button, and two seconds of network allowance. Changes affect future launches, including the current season; open windows keep their original deadlines and rewards.

Before closure, grab responses and `GET …/rocket-activity/results?launchId=…` return the TOP rewards plus provisional successful grabbers. Results now accept launchId alone and expose `grabOpen`, `finalized`, and `grabClosesAt`, alongside the existing `payoutStatus`. Campaign/stage/cycle queries and pagination remain supported.

When the window closes, the maintenance worker commits final winners and queues `audio-room:rocket:winners { roomId, launchId, cycle, recipients }` through the existing durable outbox. If no eligible in-room user claimed a slot, it uses the original launch-time random draw. If at least one claimed, unused slots stay empty. Finalization is separate from payment, so a wallet/asset retry does not hold back the final winners list. The existing idempotent `payRocketLaunch` worker then pays all top and in-room rewards.

The app should reconcile the provisional popup when the final winners event arrives, even if the animation or first popup already finished. Payouts wait until closure; wallet and props updates follow the existing flow. Previous cooldown/reset and gift-counting behavior is unchanged.

Deployment:

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh
```
