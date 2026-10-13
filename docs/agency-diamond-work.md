# Agency Diamond work and monthly salaries

Configure targets in **Agency Management → Work & Targets** using an account with `agencies.manage`. Viewing requires `agencies.view`. Targets are a shared policy across all agencies for the selected UTC calendar month. Save a policy for each month; the displayed 1,000,000 Diamond / 2% example is an unsaved draft, not an enabled payout rule.

Every recorded gift Diamond earned by a talent contributes to the agency recorded on that gift's settlement. For each talent and agency, sum that month's Diamonds, select the highest qualifying target, and multiply the entire qualifying amount by that target's percentage. Tiers do not stack. Amounts below the first target earn no agency salary but still count as work. Percentages support two decimal places; fractional salary Diamonds are rounded down per talent.

Example: ten talents each earn 1,000,000 Diamonds at a 2% target. Agency work is 10,000,000 Diamonds; agency salary is 10 × 20,000 = 200,000 Diamonds. At 90,000 Diamonds per USD, salary displays as $2.22 (USD displays truncate to cents).

Work rolls through current `Agency.bdUserId` and `User.supervisorUserId` links to each ancestor. Supervisors include direct and indirect agencies. Manager's portal shows the global total once per agency; do not add the hierarchy rows together. An agency transfer changes which management branch receives historical reporting credit. A talent transfer does not move gifts already attributed to their former agency. Target qualification is separate for each agency.

The agency owner salary endpoint and management performance endpoint expose Diamond totals and accrued agency salary alongside legacy Coin fields. BD receives performance access without team-assignment or portal-login rights. Historical gifts without a recorded Diamond value are excluded with a visible count; no Coin-to-Diamond valuation is invented. Reversed gifts are excluded. Multi-recipient gifts now record the exact Diamond credit already awarded to hosts.

Policies are versioned, audited, and locked after their month ends. Editing the current month's policy recalculates its accrued salary. These reports do not issue payments, credit a wallet, deduct talent Diamonds, or change existing gift profit-split accounting.

## Deployment

Deploy the code, install locked dependencies, run `npx prisma migrate deploy`, regenerate Prisma (`npx prisma generate`), rebuild, and restart the service. The new migration is `20261013100000_agency_diamond_salary`. Preserve the production database connection and existing data; do not reset or blindly baseline a production database. The existing migration history must be valid before deploy.
