# Diamond exchange and monthly agency statements

## Exchange

`POST /api/wallet/exchange` and `POST /api/v1/wallet/exchange` require the mobile Bearer session. Send `{"diamonds":"10000"}` and a stable `Idempotency-Key` (8–128 letters, digits, dots, underscores, colons or hyphens) for each distinct exchange action. Reuse it on retries. Without a key, each request is a separate action.

Success: `{"success":true,"data":{"diamonds":"remaining diamond balance","coins":"remaining coin balance","exchangedDiamonds":"actual debit","receivedCoins":"actual credit"}}`. All amounts are decimal strings. Replays return the original result; fetch the wallet for the latest balance after other activity. Reusing a key with another amount returns `409 IDEMPOTENCY_CONFLICT`.

The rate is an integer number of diamonds per coin. Output is floored, and only `receivedCoins × diamondsPerCoin` diamonds are debited. The requested amount must meet the minimum and must not exceed the balance. One serializable transaction updates both balances and creates a diamond debit and coin credit with the same reference. Failed ledger writes roll back balances. Concurrent writes retry serialization conflicts.

`GET /api/wallet` and `/api/v1/wallet` include `diamondExchange: { enabled, diamondsPerCoin, minDiamonds }`. Rate/minimum are strings. Errors: `403 EXCHANGE_DISABLED`, `422 EXCHANGE_BELOW_MINIMUM`, `409 INSUFFICIENT_DIAMONDS`, `422 VALIDATION_ERROR`, and `422 INVALID_IDEMPOTENCY_KEY`. Standard session/ban checks apply.

Portal: **Rules & Profit Split → Diamonds → Coins**. `rules.view` reads; `rules.manage` updates global policy and per-user access. Changes are audited. Migration defaults to **disabled**, 1 diamond per coin and minimum 10000. A manager must choose and enable the production policy. No environment variables control exchange.

## Agency salary

`GET /api/agencies/mine/salary?month=YYYY-MM` requires a mobile session and resolves the agency from the authenticated owner. The month defaults to the current UTC month. Invalid/future months return 422. Missing agency returns 404. No caller-supplied agency or user ID can select another owner's statement.

Response data includes `agencyId`, `agencyName`, `month`, `timezone: "UTC"`, `totalSalaryCoins`, `commissionCoins`, `giftIncomeCoins`, `hosts`, `topEarners` (top 3), and `months`. Each host includes `publicId`, `name`, `profileImage`, `kind`, `giftIncomeCoins`, `salaryCoins`, `commissionCoins`, `liveMinutes`, `activeDays`, and `activityCoverage`. Financial values are strings. Totals use the agency ID captured on committed gift settlements, preserving earnings after host reassignment. Hosts who earned during the selected month remain in that month's results.

`months` contains `{ month, totalSalaryCoins, commissionCoins, status }`. `ACCRUING` means current-month earned salary; `ACCRUED` means past-month earned salary. Neither means paid, approved for payout, nor an unpaid balance. No new salary/payout is issued by reading this report.

Attendance counts overlapping recorded intervals once, clips to month boundaries, and counts UTC calendar days. **User-host coverage is VIDEO_SESSIONS_ONLY**; historic audio-room sessions are not retained by the existing model and cannot be reconstructed accurately. Talent coverage is RECORDED_LIVE_SESSIONS. Clients must show the supplied `activityNotice` and must not present these figures as complete audio attendance or use them for automatic payouts.

`totalRechargeCoins` on both the dashboard and salary response now sums current agency users' actual lifetime `totalTopUp`. `rechargeBasis: "CURRENT_HOSTS_LIFETIME"` makes its scope explicit: it is not recharge attributed to historical membership or a selected month. No agency level policy exists; `agencyLevel` and `nextLevelThreshold` are explicitly null. `monthlyTargetCoins` remains the configured target.

Portal: **Agencies → Monthly Salary** offers agency/month selection, totals, top earners, host breakdown and previous statements. `GET /api/admin/agencies/{agencyId}/salary` requires `agencies.view`; it uses the same calculation as mobile.

Verification: `npm test`, `node scripts/test-diamond-exchange.mjs` (local DB only), `npm run build`. The integration test uses disposable data and tests concurrent retries and rollback without enabling the global exchange policy.
