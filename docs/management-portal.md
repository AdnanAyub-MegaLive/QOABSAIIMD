# Scoped management portal

## Mobile handoff

Use the server-returned `management.portal.enabled` in authenticated identity
responses to show the portal button. Only application SUPER_ADMIN and COUNTRY_HEAD
currently qualify. Other management roles keep their authenticated team APIs.

1. POST `/api/v1/management/portal-session` with the mobile Bearer token.
2. Read `data.url` and `data.expiresAt` from the standard success envelope.
3. Open that URL unchanged, including its fragment, in the in-app browser.
4. The launch page exchanges the one-use ticket for an HttpOnly browser cookie.
5. If expired, return to the app and request a new link; never reuse a link.

Never place a mobile token or account ID in a portal login URL. Allowlist the
configured portal origin in the app. The handoff lasts at most 60 seconds;
browser sessions last at most 30 minutes and never outlive the parent token.
Every request rechecks role, session version, account and device restrictions.
An account ID alone cannot authenticate. Browser writes require the configured
Origin; the cookie is HttpOnly, SameSite Strict and scoped to `/management`.
Production requires HTTPS through `MOBILE_API_BASE_URL`.

## Implemented permissions

- Admin is an eligible agency reference, alongside the existing higher roles.
- Team limits remain database-configured, with existing direct/subtree counting
  and ancestor-removal policy. Assignments remain same-country and audited.
- Team agencies: GET `/api/v1/team/agencies`; POST with `{ "agencyId": "AGN-..." }`
  assigns an active, unassigned, same-country agency to the caller. Existing
  assignments cannot be stolen; transfers remain a separate Manager operation.
- Monthly performance: GET `/api/v1/team/performance?month=YYYY-MM`; optional
  `agencyId` drills down into host salary figures within the caller's team.
- The dedicated portal exposes team, agency supervision and monthly performance.
- Super Admin additionally has country-wide user/audio-room ban/unban and audit
  history. User scope uses the account country; room scope uses its owner's
  country. Cross-country actions and self-ban are rejected. Timed and permanent
  bans are supported. Country Head does not implicitly receive moderation.

Performance reports use UTC months and current agency supervision, not historical
hierarchy snapshots. Salary totals represent accrual, not settled payout bills.
Direct agency application/grant APIs retain their own reference scope; the new
portal does not add an application-review screen.

## Deployment and verification

Apply pending Prisma migrations, generate the client, and restart the custom
server. Two management-session migrations add hashed tickets/browser sessions
and preserve the original mobile expiry. No platform Admin rows are created.

Run `npm test`, `npm run build`, and
`node scripts/test-management-portal-db.mjs`. The database test rolls fixtures
back and covers handoff reuse, browser validation, ban/unban and role revocation.
Mobile WebView end-to-end testing and production HTTPS deployment remain required.

## Not included

Country Head prop grants/monthly limits, Manager transfers, a portal agency
application-review UI, and the mobile button implementation are not delivered by
this change. No unapproved grant quotas or Titled/Actual permission differences
are invented. This portal is separate from unrestricted platform staff access.
