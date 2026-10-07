# Avatar history and public profile

`GET /api/v1/users/me/avatar-history` requires a mobile Bearer session; identity is taken only from that session. Returns `{success:true,data:{items:[{id,imageUrl,createdAt}]}}`, newest first, at most 20, excluding the equipped picture. Presets such as `avatar:robot` are preserved. Filesystem and device-local URIs are omitted. Empty history is `items: []`.

`PATCH /api/v1/users/me` (and the legacy profile route) archives the previous image and updates the profile in one row-locked transaction. Unchanged images and consecutive duplicate history entries are not inserted. Retention is configured by `UserProfileSettings` row `default`, `avatarHistoryLimit` (1–20, default 20). Trimming removes history rows only, never asset bytes. Historical changes made before this migration cannot be reconstructed. Administrative removal of an inappropriate image remains a moderation action, not an invitation to restore it.

`GET /api/v1/users/{publicId}/profile` preserves counters, relationships to the viewer, progression, and profile-access checks. Gift-wall rows now include public gift IDs and signed `mediaUrl` plus `mimeType`; unavailable assets have null media fields. DOB remains null unless public, self, or an accepted friend. A user is not their own friend.

Home Dress fields currently return null. `relationships` and `medalWall.items` currently return empty arrays: there are no separate Home Dress equipment, CP/BFF/BRO/SIS relationship, or medal award models in the current portal. These domains require their own assignment/consent rules before real records can be returned. Business Card and badge assets are not silently repurposed for these fields.

Apply migration `20261007200000_avatar_history`, regenerate Prisma, and restart the portal.
