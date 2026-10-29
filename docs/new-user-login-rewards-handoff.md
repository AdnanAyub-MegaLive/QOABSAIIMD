# New-user seven-day login rewards

Status: implemented locally, not activated/deployed or verified on phones.
Migration: `20261027020000_new_user_login_rewards`. No seed or backfill.

Platform Admin configures seven rewards in Daily Tasks → New-user 7-day login
rewards. Each day supports Coins, an equippable prop (frame/ride/etc.), or VIP,
with duration for props/VIP. Existing reward-grant services preserve permanent
props and extend timed ownership. Selecting a prop does not auto-equip it.

Each publication is immutable and applies only to accounts created strictly
after its effective timestamp. The most recent policy before registration is
used forever for that account. Accounts registered before activation or during
a disabled policy never become eligible later. Disable stops new enrollment;
existing eligible accounts retain their policy. No regular daily-task/streak
records are modified by this feature.

Day 1 is [createdAt, createdAt+24h), day 2 the next 24h, etc. All timestamps are
UTC. Campaign expires exactly 168 hours after account creation. Missed windows
are lost; later days remain claimable in their own windows. No reset/repeat.

## Mobile API
Bearer/device/account checks are the existing mobile checks.
GET `/api/v1/tasks/new-user` (alias `/api/tasks/new-user`):
`{success:true,data:{eligible,reason,policyId,currentDay,serverTime,expiresAt,days}}`.
Ineligible accounts return reason NOT_ELIGIBLE and an empty days array.
Expired enrolled accounts return reason EXPIRED and their schedule.
Day entries: `{day,opensAt,closesAt,state,reward}`; state is AVAILABLE, LOCKED,
MISSED or CLAIMED. Rewards use `{kind:"COINS",coins:"77"}`, or
`{kind:"PROP",id:"AST-...",days:3}`, or `{kind:"VIP",id:"...",days:7}`.
GET includes available name/media metadata from the shared reward display helper.

POST same endpoint with JSON `{ "day": 1 }`. App may invoke on authenticated
login for the AVAILABLE day, or show a claim button. GET alone awards nothing.
Success: `{success:true,data:{claimId,day,reward,coinBalance,claimedAt}}`.
Account/day is the idempotency key: retries return the stored receipt even after
expiry and do not award twice. That receipt's balance is historical; refresh the
wallet for the latest balance. Claims, grant, wallet credit, ledger and audit
are atomic under a user-row lock and Serializable transaction.

Errors: 422 VALIDATION_ERROR; 409 NOT_ELIGIBLE, REWARD_EXPIRED,
REWARD_NOT_READY; 429 RATE_LIMITED; 503 RETRY_REQUIRED; existing authentication
errors. Keep previous successful data on transient failures, never claim success
from an error. Refresh props/VIP/wallet after a successful claim. All responses
are no-store. Use serverTime and window boundaries, not the phone clock.

Deploy migration/generate/build/restart, then explicitly publish a policy.
Verify with newly created QA accounts only: no existing-account eligibility,
repeated/concurrent claims, missed-day/168-hour boundaries, prop/VIP grants and
independent regular check-in. No production balances or past rewards were changed
during implementation. Physical-device and database concurrency verification
remain separate from mocked regression tests.
