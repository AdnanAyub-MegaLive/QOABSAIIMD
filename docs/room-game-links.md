# Room game links

Open **Room Management → Games** (`/room-games`). Add a name and launch URL,
choose a display order, and set visibility to Visible. Hidden games do not appear
in the authenticated `GET /api/v1/games` catalogue. Settings apply to all rooms.
Existing portal games can also be renamed, ordered or hidden here; their generated
launch URLs and wager settings remain managed by the existing game system.

External game records use the existing GameDefinition JSON settings and audited,
revision-checked saves. No database migration is required. Only active portal
administrators can access the management endpoint `/api/admin/room-games`.
HTTPS links are required, except private LAN/localhost HTTP during development.

## Mobile integration

Fetch `/api/v1/games` with the mobile Bearer token and render the returned `games`
list. Refresh when opening the games sheet to pick up saved visibility changes.
Each item includes `id`, `name`, `engine`, `status`, `sortOrder`, `revision`,
`launchUrl` and `requiresPortalSession`.

- `engine: external`, `requiresPortalSession: false`: open the supplied URL directly.
  Never attach a portal token, Authorization header, cookie or native wallet bridge
  to an external game. External navigation from a portal game must follow this rule too.
- Portal engines use `requiresPortalSession: true` and the existing trusted portal
  launch flow. Limit token delivery to the configured portal origin.
- An older client that hardcodes supported game engines or always appends a token
  must adopt these rules before displaying external game links.

Adding a link publishes a catalogue entry. It does not integrate a third-party
game's account or payment system with the portal wallet. Linked games cannot
settle wagers through the portal game endpoint.
