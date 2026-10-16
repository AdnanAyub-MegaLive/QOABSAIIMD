# Ranking event

Event Management → Events → Create ranking event creates a draft. Publish it using the existing event publishing control. Public entry: `https://portal.megachat.live/event/rankings/index.html`. Unpublishing also disables the ranking API. No migration or balance changes are required.

Four categories: Wealth (gift Coins sent), Charm (gift Coins received), Agency (gift Coins attributed to that agency in settlement), CP (gifts exchanged between currently active, mutually accepted partners after relationship start). Reversed gifts are excluded. Self-gifts retain their recorded value. Family is intentionally excluded. Periods use UTC: Daily, Monday–Sunday Weekly, calendar Monthly. Scores are decimal strings; never convert balances to floating point.

## In-app browser integration

Use a trusted WebView restricted to the exact production origin and ranking path. On receiving `{type:"ranking:ready",version:1}`, inject `window.MegaRankings.setSession(TOKEN)` using JSON.stringify to safely encode the existing mobile Bearer token. The page keeps it in memory only; never put tokens in URLs, navigation parameters, localStorage, logs or analytics. Inject only after validating the current WebView URL; never inject into arbitrary uploaded events or external pages. On logout call `clearSession()` and close the view.

Handle messages `ranking:close`, `ranking:open-profile` (publicId), and `ranking:session-required`. Reopen/refresh through the normal mobile authentication flow when needed. No password or portal-admin session is required. The browser without a mobile session intentionally shows an app-launch instruction.

`GET /api/v1/events/rankings?type=wealth&period=today&offset=0&q=` requires Bearer authentication. Categories: wealth/charm/agency/cp. Periods: today/week/month. Pages contain up to 20 entries and nextOffset; search is used for Agency. Responses include rule, resetsAt, generatedAt, timezone, scoreUnit and public identity artwork. Banned/deleted/blocked identities are excluded. No wallet balances are returned. The rule button is informational; no ranking rewards are configured or awarded by this page.

## Phone verification

- Verify all four themes at narrow and large widths, safe areas, scrolling, daily/weekly/monthly changes and Agency search.
- Check actual ranking amounts against gift records, including refunds, self-gifts, historical agency attribution and CP start dates.
- Verify empty/error states, retry, pagination, expired sessions and logout. Never show sample users as real ranks.
- Verify avatar/badge CDN URLs load; SVGA badges use available posters in this web list.
- Confirm back/profile navigation is handled by the app; test Android and iOS WebViews.
- Verify tokens never appear in browser URLs/history. No Family tab should appear.

Deployment and real-device verification remain separate from local implementation checks.
