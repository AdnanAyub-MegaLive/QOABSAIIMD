# Portal UI audit — 15 November 2026

Status: shared UI improvements implemented locally. Not pushed or deployed. Authenticated read-only spot checks were completed on Dashboard, Uploads (including opening and cancelling the add-frame dialog), Agencies, Finance, Games Management and Room Management. Local PostgreSQL was offline, so browser verification used an isolated temporary review page with sample data and the real shared components. That review route was removed after verification.

## Changes

- Admin-only visual foundation: system typography, readable small labels, consistent focus/disabled states, form sizing, responsive headers and scrollable long dialogs. Public ranking pages and game player routes retain their own styles.
- Sidebar: consistent icons, clearer selected states, a skip-to-content link, mobile navigation, and a fix for both Rules and Global Announcements being highlighted together.
- Cards: shared borders, radii and subtle shadows across dashboard, users, hosts, agencies, finance, wallet, rules, rankings, uploads and profile screens.
- Tables: keyboard-accessible scroll regions, column-header semantics, search-specific empty states and a clear-search action. Inactive/unverified/unpaid statuses no longer match the positive "active/verified/paid" badge checks.
- Pagination: styled controls, directional icons, disabled/loading states and loading placeholders.
- Feature search: arrow-key selection, Enter activation and combobox/listbox semantics.
- Dialogs: shared focus trapping, Escape dismissal when not saving, focus restoration and body-scroll locking. Applied to asset management/upload/archive, user creation/profile actions/props, coin/diamond adjustments and agency creation/reviews.
- Media: contained image/video previews, transparency grid, expanded preview dialog, missing-file and load-error states, retry, lazy image loading and non-autoplay media. SVGA retains an explicit poster fallback; this does not add an SVGA animation player.
- Framer Motion: short entrance transitions on navigation, record panels, search results and dialogs; respects the user's reduced-motion setting. CSS motion is also reduced.
- Events Studio: mobile navigation and logout access, corrected branding, wrapping header, and request-time rendering for authenticated data instead of build-time database queries.
- Global Announcements: restored the main portal sidebar and content layout.

## Verification

- Browser component review at 1440px, 390px and 320px widths. Document width equalled viewport width at all checked sizes.
- Checked mobile navigation, expanded preview, search empty/clear states, Tab/Shift+Tab wrapping, Escape dismissal, return focus and scroll-lock cleanup. No browser console errors in the review.
- Changed JavaScript lint: no errors; six existing image-optimization warnings remain in message/ranking/host components.
- 40 existing permission/upload regression tests passed across four test files.
- Production build passed after marking the authenticated Events layout force-dynamic. Existing next.config module-format warnings remain.
- No database schema, balances, payout rules, permissions or production configuration changed.

## Authenticated findings and remaining verification

Live Finance exposed cramped recharge controls; the local component now has styled buttons/fields and a keyboard-accessible scrolling table. Room moderation exposed narrow wrapped columns and bare filters/pagination; the local component now uses consistent controls and a minimum-width scrolling table. These two follow-up edits pass ESLint and diff whitespace checks.

The signed-in checks inspected the currently deployed UI, not the unshipped local changes. Individual permission roles, actual media playback formats, finance approval submissions and Events publishing remain unverified. Sample-data component testing is not evidence that every live workflow has been visually checked. No financial or publishing actions were submitted during this audit.

## Preview evidence

Screenshots are local artifacts in `output/ui-audit/desktop.jpg` and `output/ui-audit/mobile.jpg`. They show sample records, not production data.
