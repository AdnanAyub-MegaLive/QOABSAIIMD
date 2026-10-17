# Ranking webpage app developer handoff

Updated 16 October 2026. The production ranking event is published and its authenticated API is working. The app hosts the page in its WebView and supplies the existing mobile session; the page renders rankings and fetches data itself. Android and iOS native integration must still be verified on devices.

Event Management → Events → Create ranking event creates the combined draft. Public entry: `https://portal.megachat.live/event/rankings/index.html`. The separate reward events described below require the ranking reward migration. Nothing is awarded merely by deploying or publishing a page.

## Separate events and automatic rewards

In Event Management → Events → Ranking events & automatic rewards, create each draft, then publish it in the event list:

| Event | Public path |
|---|---|
| Wealth | `/event/ranking-wealth/index.html` |
| Charm | `/event/ranking-charm/index.html` |
| Agency | `/event/ranking-agency/index.html` |
| CP | `/event/ranking-cp/index.html` |

These pages retain the existing native session and navigation messages. Add their exact HTTPS document paths (including their directory and trailing-slash equivalents) to the app's trusted main-frame allowlist. Do not broadly trust arbitrary event pages with a session token. Each page fixes its ranking category and offers Daily, Weekly and Monthly filters. Family remains excluded. The combined page remains available.

The separate pages call the existing ranking API with `event=ranking-wealth` (or the matching other slug). The API requires that specific event to be published and rejects a mismatched category. Responses also include `rewardPolicy` and `upcomingRewardPolicy`, each nullable, containing `enabled`, `effectiveFrom` and rank rewards. The webpage displays these itself; the native app does not calculate or award anything.

Only Event SUPER_ADMIN can save financial reward settings or retry held rounds. Choose each event and period, add up to 20 rank rewards and enable future awards. Each rank may contain Coins, Diamonds, up to 10 equippable props with 1–365-day durations, and an optional VIP tier with a 1–365-day duration. Agency rewards go to its owner; each CP partner receives the full configured reward. All three periods are independent, so a winner can earn daily, weekly and monthly rewards.

Settings take effect at the next complete UTC period: next midnight, next Monday or first of next month. Editing or disabling a policy also applies at that next boundary; the current period keeps its announced settings. No rounds before first activation are created. Unpublishing prevents payouts while unpublished. A period processed while unpublished is marked SKIPPED, not paid later.

Scores remain confirmed, unreversed gift face value in Coins, including self-gifts. Agency attribution uses gift settlement records. CP scores use gifts exchanged between active partners since the relationship began. Ties use ascending public ID. Viewer blocks hide people without renumbering the global rank. The server freezes recipients and scores after closing, then awards the round atomically with wallet BONUS entries, inventory/VIP updates, audit records and notifications. Rewards do not award gifting XP. A restart cannot pay a completed round again.

Timed props extend existing expiry; permanent ownership is never shortened. A prop overlapping an existing conditional role/VIP entitlement is held for review instead of overwriting its revocation rules. VIP duration extends ownership of that tier without replacing another valid selected tier. Already selected or otherwise absent/expired VIP selection is synchronized. If a recipient or reward asset is unavailable, the whole round enters REVIEW without partial payment. Snapshots captured more than ten minutes after closing also require review, because agency ownership and CP membership may have changed during downtime. Admin must verify the frozen recipients and scores and resolve the cause before Retry held round; retries use the same frozen winners. Completed awards are never automatically rewritten after a later gift refund; those cases need reconciliation and explicit review.

Deploy the migration with `npx prisma migrate deploy`, regenerate Prisma, rebuild, and restart the custom `server.js` process. Its minute-based worker closes and awards eligible rounds. Keep it running; a static-only deployment cannot pay rewards. New separate event drafts copy the prepared template and rewrite its asset base path. Do not upload the unmodified combined template over a separate event, because that would reset its category and asset path.

Phone checks: open all four URLs with the existing handshake, switch periods without revealing other category tabs, inspect configured current/upcoming rewards, verify profile/agency navigation, expired session recovery, and native Back. With dedicated test accounts, verify both CP partners receive full rewards, agency rewards reach only the owner, wallet/My Props/VIP refresh after notification, and retries do not duplicate awards. Production configuration and real-device acceptance must be completed after deployment; this change does not itself enable rewards.

Four categories: Wealth (gift Coins sent), Charm (gift Coins received), Agency (gift Coins attributed to that agency in settlement), CP (gifts exchanged between currently active, mutually accepted partners after relationship start). Reversed gifts are excluded. Self-gifts retain their recorded value. Family is intentionally excluded. Periods use UTC: Daily, Monday–Sunday Weekly, calendar Monthly. Scores are decimal strings; never convert balances to floating point.

## Session handshake

Use a trusted WebView restricted to the exact production origin and ranking path. On receiving `{type:"ranking:ready",version:1}`, inject `window.MegaRankings.setSession(TOKEN)` using JSON.stringify to safely encode the existing mobile Bearer token. The page keeps it in memory only; never put tokens in URLs, navigation parameters, localStorage, logs or analytics. Inject only after validating the current WebView URL; never inject into arbitrary uploaded events or external pages. On logout call `clearSession()` and close the view.

Handle messages `ranking:close`, `ranking:open-profile` (publicId), `ranking:open-agency` (agencyPublicId), and `ranking:session-required`. Reopen/refresh through the normal mobile authentication flow when needed. No password or portal-admin session is required. The browser without a mobile session intentionally shows an app-launch instruction.

Register the native message handler before loading the page. The webpage sends `ranking:ready` once after its JavaScript initializes; do not rely on a fixed delay. A reload creates a new handshake. Send the raw token, without the `Bearer ` prefix, to `setSession`; the page adds the prefix to API requests.

Injection payload construction, after the app has checked the current document URL and obtained a valid session:

```js
const script = `window.MegaRankings && window.MegaRankings.setSession(${JSON.stringify(sessionToken)}); true;`;
webViewRef.current?.injectJavaScript(script);
```

Allow only HTTPS, hostname `portal.megachat.live`, no nonstandard port, and the exact document paths `/event/rankings`, `/event/rankings/` or `/event/rankings/index.html`. Do not use a hostname substring match. Reject unexpected main-frame navigation and never inject after navigating away. CDN image requests are subresources, not permission to navigate the document to the CDN. Do not disable TLS validation, enable mixed content or allow local file access for this page.

Parse incoming messages as JSON with try/catch and validate their shape and trusted source URL. Ignore unknown message types. The webpage does not accept a token through `window.postMessage`; use the documented injected function.

| Webpage message | Native action |
| --- | --- |
| `{ "type": "ranking:ready", "version": 1 }` | Validate the document URL, then inject the current mobile token once for this document. |
| `{ "type": "ranking:session-required" }` | The ranking API returned 401. Stop replaying the rejected token; use the app's normal session validation/login flow, then inject a valid token or close the page. |
| `{ "type": "ranking:close" }` | Pop or dismiss the ranking WebView and return to the originating app screen. |
| `{ "type": "ranking:open-profile", "publicId": "USR-…" }` | Validate publicId and open the existing native profile screen; preserve the ranking screen for return navigation if desired. |
| `{ "type": "ranking:open-agency", "agencyPublicId": "AGN-…" }` | Validate agencyPublicId and open the native Agency Details screen using that public ID, not the agency owner's user ID. |

Do not repeatedly inject on every render or navigation-state notification: each `setSession` call triggers a request. If ready was missed, a guarded on-load recovery may inject after confirming `MegaRankings` exists, but ensure it runs only once per document. There is no dedicated authentication-success bridge message; successful ranking rendering and HTTP 200 confirm data retrieval.

On logout/account switch, call `window.MegaRankings.clearSession(); true;` when possible and immediately unmount the WebView. Do not reuse an old user's page instance. Never log the injection string or Authorization headers.

## Back and profile navigation

The page's top-left back button emits `ranking:close`; it does not call browser history itself. Native Android Back and iOS back/swipe dismissal should return to the originating screen rather than exit the app or reload the ranking page. Check that a single tap closes only one screen.

Wealth and Charm names are tappable in the featured winner, top-three podium and remaining list. They emit `ranking:open-profile` with the person's server-provided publicId (USR/TLN or another supported account ID). CP partner buttons in the hero and list continue to use the same message.

Agency podium entries and list cards are tappable and emit `ranking:open-agency` with `agencyPublicId`, taken from the ranking entry's `id`. The decorative Agency and Host header is not an agency link. No session token, internal database ID or wallet data is included in either navigation message. The app must load details through its authenticated API and handle unavailable/deleted targets normally. Keep the ranking WebView mounted when opening details if the selected period, search and scroll position should survive returning.

This navigation addition requires uploading a new event version: deploying repository files alone does not update the already-published copy. In Event Management, use **New version** for the existing `rankings` event and upload the contents of `event-templates/rankings` with `index.html` at the upload root. Uploading switches the active version immediately and preserves its status: if the event is already Published, the new version goes live immediately; if Draft, click **Publish** afterward. To review before going live, unpublish first (this temporarily disables the event), upload, then publish. Do not create a second event or change the slug. Reload the WebView after publication; JS/CSS may remain cached for up to five minutes. The production verification below predates this navigation addition.

## Ranking API and refresh behavior

`GET /api/v1/events/rankings?type=wealth&period=today&offset=0&q=` requires Bearer authentication. Categories: wealth/charm/agency/cp. Periods: today/week/month. Pages contain up to 20 entries and nextOffset; search is used for Agency. Responses include rule, resetsAt, generatedAt, timezone, scoreUnit and public identity artwork. Banned/deleted/blocked identities are excluded. No wallet balances are returned. The combined page is informational; rewards are configured for the separate events above and awarded by the server worker.

Requests are limited to 60 per minute per user. The page fetches on session injection, category/period changes, debounced Agency search, Show more, retry and period expiry. It does not subscribe to live ranking socket updates or continuously poll. Rankings are refreshed snapshots, not a live score ticker.

An empty successful `entries: []` response means no qualifying rankings; it is not a service failure. A missing/invalid session returns 401, an unpublished event returns 404 `EVENT_UNAVAILABLE`, invalid filters return 422 and excessive requests return 429. A 502 is an upstream availability problem, not evidence that the user should be logged out. Offer retry without discarding a valid app session for 5xx/network failures.

Artwork comes from server-provided public display/CDN URLs. Preserve URL version/signature parameters. This page uses WebView/browser caching, not the mobile app's native file cache. SVGA badges use their poster when available; this page does not include an SVGA animation player.

## Production verification

Verified on 16 October 2026, with a short-lived token for an existing dedicated QA account and no balance or account changes:

- Ranking event: PUBLISHED, version 1.
- HTML, JavaScript, CSS and artwork: all 29 files returned HTTP 200. Published HTML/JS/CSS matched the deployed template.
- All 12 authenticated category/period combinations returned HTTP 200 with descending scores.
- Monthly snapshot: Wealth 11 entries, Charm 14, Agency 2, CP 0. These are observations, not fixed expected counts.
- Requests without a token correctly returned 401. All four browser tabs and Agency controls loaded.
- Earlier 502s corresponded to Nginx connection refusal to Node on `127.0.0.1:3000` during the deployment window around 6:51 PM Pakistan time. Nginx configuration passed validation and the upstream recovered. No routing change was needed.

## Android and iOS acceptance checklist

- Verify all four themes at narrow and large widths, safe areas, scrolling, daily/weekly/monthly changes and Agency search.
- Check actual ranking amounts against gift records, including refunds, self-gifts, historical agency attribution and CP start dates.
- Verify empty/error states, retry, pagination, expired sessions and logout. Never show sample users as real ranks.
- Verify avatar/badge CDN URLs load; SVGA badges use available posters in this web list.
- Confirm back/profile navigation is handled by the app; test Android and iOS WebViews.
- Verify tokens never appear in browser URLs/history. No Family tab should appear.
- Cold-open the page from the app: ready message arrives, token is injected once, API returns 200 and rankings replace the app-launch instruction without a portal login form.
- Reload the WebView and background/foreground the app. Confirm session recovery does not cause a request loop or unintended logout.
- Test an invalid/expired token: one recovery flow, no repeated rejected-token injection. Test logout and switching accounts: old rankings must not remain accessible.
- Test the page back button, Android hardware/system Back and iOS native Back. Return to the correct originating screen exactly once.
- Test CP profile buttons with eligible test data and return from the native profile. CP currently has no qualifying production entries, so this populated state has not been verified against live production data.
- Tap Wealth and Charm names in the hero, each podium position and a lower-ranked row: exactly one `ranking:open-profile` arrives with the correct publicId. Check long/truncated names and return navigation.
- Tap an Agency podium entry and lower-ranked card, including after an Agency search: exactly one `ranking:open-agency` arrives with its AGN public ID, never its owner's USR/TLN ID. Verify Agency Details loads and Back returns to rankings.
- Test offline launch, network loss and 502/503 recovery. A failed page load must not be treated as a revoked session.
- Test Agency ID/name search and clearing it, rapid tab changes, long names, missing artwork, empty results and scrolling at narrow widths. Pagination beyond 20 is not proven by the current monthly production datasets, which contain fewer than 20 entries each.
- Confirm reset countdown uses server UTC boundaries, independently of the phone's timezone. Verify small and large text settings and safe-area spacing.
- Confirm the installed WebView supports BigInt, AbortController and HTML dialog; the page uses all three.

Release acceptance requires real-device verification of native token injection, navigation and error recovery. Server/API checks alone do not certify those behaviors. No phone-only pass is claimed by this handoff.
