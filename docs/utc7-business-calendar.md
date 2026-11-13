# UTC+7 Portal and business calendar

Portal dates, times, date filters and wall-clock inputs use `Asia/Bangkok` (GMT/UTC+7, no daylight saving). Stored timestamps and API timestamps remain UTC ISO instants. Dates of birth remain date-only values.

Calendar-based daily tasks/check-in, Diamond limits, daily/weekly/monthly rankings, Weekly Star, Pretty ID weeks, room rewards, game days, attendance, salary cycles and reports use the shared business calendar. Weekly periods begin Monday; half-month periods begin on the 1st and 16th. Hourly periods still cover the same absolute hours. Durations measured from an action (CP maintenance, expiry, cooldowns, seven-day newcomer eligibility, rolling rate limits) retain their durations.

## Deployment

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh &&
pm2 status megalive-portal
```

The script keeps the running release online while preparing the next release. There is one final PM2 restart.

Before building, it persists `NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT` in the original checkout's `.env.local`. The initial value is the second upcoming UTC midnight, allowing at least 24 hours for deployment. Both client bundles and the server use this same value. Do not change it after deployment; retain `.business-timezone-active` beside `.env.local` when moving/backing up the installation.

Display changes take effect when the new release starts. Each business calendar finishes its current UTC period first. The first UTC+7 period then starts at the old boundary and ends at the next local boundary, making that one period seven hours shorter. Subsequent periods use normal UTC+7 boundaries. Past reporting windows and payout receipt keys retain their original interpretation; nothing is paid twice or backfilled. Targets are not prorated.

For example, a cutover of `2026-11-15T00:00:00Z` switches days on November 15, weeks and half-months on November 16, and calendar months on December 1. The first daily period ends November 15 at 17:00 UTC (November 16, 00:00 UTC+7).

`align-business-schedules.mjs` adjusts only unstarted UTC-boundary configurations (including Weekly Star selections), with an audit entry. It leaves committed payouts, completed periods and absolute user expiry timestamps intact. It is idempotent. A pending 15/30-day policy change keeps adjoining periods contiguous.

The deployment refuses an expired initial deployment window or a changed permanent cutover. If an initial deployment fails and is not retried before its prepared cutover, inspect the prepared schedules before choosing a new cutover. Do not deploy this change by manually restarting an old build without the deployment script.

## Events and app integration

The API supplies absolute `resetsAt`, `nextResetAt`, `start` and `endExclusive` instants. Apps should use these instead of calculating midnight locally. Timezone metadata is `Asia/Bangkok` after each calendar transitions. Hour IDs remain UTC ISO strings so hourly receipts retain their identity.

Updated bundled ranking templates describe UTC+7 and display reward dates in UTC+7. Existing published event versions are immutable: republish an updated template through the Event Portal to update its explanatory text. Backend scoring and countdown timestamps change independently of the published artwork/version.

No mobile app release is needed for server scheduling or Portal display changes.
