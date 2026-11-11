# Specs 197–198

Room responses now include `owner.agencyPublicId`: the owner's current membership agency public ID (for example `AGN-123`), or `null` when unassigned. No internal agency IDs are exposed. The field is included by the existing room queries, without a profile request per owner.

Available on `GET /api/v1/audio-rooms`, `/api/v1/audio-rooms/discover`, `/api/v1/audio-rooms/recent`, and `/api/v1/audio-rooms/search`, and their unversioned equivalents. The base route returns the authenticated user's own room; discovery returns live rooms by default. Existing visibility rules, limits and pagination remain. This implements the requested response-field option, not an `?agency=` filter. The app can compare `room.owner.agencyPublicId` with the viewer's agency ID for its PK Agency tab; null does not match an agency. Client filtering only covers rooms returned by the current list/page.

Ranking rows below rank 3 use the equipped-frame helper in the shared template and CP fallback, including both CP partners. Wealth, Charm and Game already call it; the current CP design also already uses equipped portraits. Agency presentation is unchanged. Animated formats use the existing renderer/poster fallback. No app release is needed for the ranking correction.

Run on the Droplet to deploy and replace published ranking bundles with new immutable versions:

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh &&
node scripts/republish-ranking-frames.mjs
```

The republish command only handles `rankings`, `ranking-wealth`, `ranking-charm`, `ranking-game`, and `ranking-cp`. It skips absent/unpublished events, leaves Agency untouched, preserves reward policies and logs each new version under an active Events Super Admin. It publishes the current repository templates, replacing any customizations in the previous bundle. Previous versions remain available for rollback in the Event Portal. Avoid concurrent event regeneration while running the command. Reopen ranking pages in the app afterwards.
