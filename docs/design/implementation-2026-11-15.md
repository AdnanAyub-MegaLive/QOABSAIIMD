# Mega Live Ops design implementation

Implemented from `mega-live-ops.md`, preserving existing service calls, form actions, permissions, game configuration logic, and event publishing logic.

## Design decisions

The supplied document has conflicting YAML and prose tokens. The detailed component specifications are authoritative: marine navigation (#0A1C20 / #0F292E), slate canvas (#F8FAFB), emerald actions (#059669), 8px controls, 10px cards, 12px dialogs. Hanken Grotesk and Geist variable fonts are bundled locally through Fontsource; visitors do not request fonts from Google.

`src/app/portal-ops.css` scopes the unified theme to `.portal-ui`. The main administration pages and shared room/live shells, Game Management, and Events Management use this scope. Embedded game players and public event artwork retain their own presentation.

The sidebar is shared between administration and Events Studio, with existing permission-filtered links and event roles preserved. Game Control keeps its existing tab state and handlers. All three desktop rails support a compact mode. Typography, fields, tables, cards, buttons, dialogs and preview styling use the same design vocabulary. Existing reduced-motion-aware Framer transitions remain in place.

## Verification

- Production `next build`: passed.
- ESLint for the new/updated JavaScript in this design pass: passed.
- Permission and upload regression tests: 40 passed, four files.
- Browser sample-data verification using actual shared components, Events table/navigation, and Game Control in practice mode: desktop 1440px, mobile 390px, compact administration 320px; no document-level horizontal overflow in checked views.
- Checked 260px/68px rail behavior, game configuration dialog sizing, shared dialog Escape dismissal and scroll lock, and mobile Events table scrolling.
- Browser console: no errors in the review.
- Temporary review route removed after verification. Screenshots are sample-data previews, not deployed production screens.

## Delivery status

Local implementation only; not committed, pushed or deployed. The local database is offline, so authenticated end-to-end data mutations were not exercised. This verification does not claim every record, permission role, media format, or live publishing workflow was tested.

Preview evidence: `output/ui-audit/ops-admin-desktop.jpg`, `ops-games-desktop.jpg`, `ops-events-mobile.jpg`.

## Brand revision — 16 November 2026

At the user's request, the supplied purple Mega owl logo replaces the previous logo/letter mark. Brand colors are deep purple navigation, violet primary actions, lavender accents and restrained gold highlights. Layout, workflow and semantic currency/error colors remain unchanged. This revision supersedes the original teal/emerald brand palette in the design specification. The local development database and its backups are excluded from Git and deployment.
