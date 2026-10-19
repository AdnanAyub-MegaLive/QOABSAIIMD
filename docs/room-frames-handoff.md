# Room Cover Frames — Mobile Handoff

## Portal

Uploads → Props → Room Frames (ROOM_FRAMES) is separate from avatar FRAMES.
Admin uploads PNG, JPEG, WebP, GIF or SVGA, optionally supplies a poster, and configures the existing store price, distribution and ownership duration. SVGA uses the existing secure validator and 8 MiB/30-second limits.
Enable Store visibility and set distribution to STORE to sell it.

## Store and inventory

Use GET /api/store?category=ROOM_FRAMES and POST /api/store/{assetId}/purchase. Purchasing grants inventory ownership; it does not automatically equip a room. The existing purchase endpoint rejects another purchase while ownership is active with PROP_ALREADY_OWNED; it does not replay the original success response. After an uncertain purchase outcome, refresh inventory and balance before offering a retry.
My Props includes Room Frames. Do not use the user-profile equip endpoint for this category.

## Apply/remove

Bearer-authenticated PUT /api/v1/audio-rooms/{roomId}/frame

Body: {"assetId":"AST-..."}; remove: {"assetId":null}.
The unversioned /api/audio-rooms/{roomId}/frame endpoint is also available.
Only the room owner may apply/remove a frame. The selected asset must be active, category ROOM_FRAMES, and owned with an unexpired assignment. Global visibility alone is not ownership.
No Coins are charged for equipping. The existing store purchase handles payment.

Success:
```json
{"success":true,"data":{"roomId":"ROOM-123","roomFrameVersion":1,"roomFrame":{"assetId":"AST-123","url":"https://...","mimeType":"application/svga","mediaVersion":"content-hash","posterUrl":null,"posterMimeType":null,"posterMediaVersion":null,"version":1}}}
```

On removal, roomFrame is null; roomFrameVersion increments.
Errors include ROOM_OWNER_REQUIRED (403), PROP_NOT_OWNED (403), ROOM_UNAVAILABLE (404), VALIDATION_ERROR (422). A failed request must not change the displayed selection.

## Display and realtime

Room list/discovery/search/recent responses and the socket join snapshot include roomFrame and roomFrameVersion with the room cover.
Listen for audio-room:frame-changed, shaped {success:true,data:{roomId,roomFrame,roomFrameVersion}}.
Update matching cached room cards and the in-room cover. Ignore older revisions. On reconnect/refetch, use the authoritative snapshot.
Render the frame as a separate overlay around the room cover, not around the owner's avatar and not as a room background.
Use MIME type for SVGA/GIF rendering and the optional poster in lists. Keep the original cover underneath.
Expired/revoked/inactive items return null on refreshed room data; do not preserve a previous frame when the server returns null. No separate expiry push is introduced by this change.

## CDN and caching

Public store artwork uses the existing hash-versioned CDN pipeline. Restricted assets retain protected display URLs. Preserve the media version in local cache keys, including the poster's separate version. Never build URLs from filesystem paths or remove signature checks.
Use roomFrameVersion for room selection changes; mediaVersion identifies file content. They are not interchangeable.

## Phone QA

- Purchase a Room Frame and verify the existing store debit, then select it on the owner's room.
- Confirm PNG/GIF/SVGA overlays in room cards and the room header on a second phone.
- Verify an optional poster and cached playback after reopening.
- Replace artwork in the portal and confirm the new media version downloads once.
- Attempt another user's room, an unowned asset, an expired assignment and an avatar frame ID; all must fail.
- Remove the frame and confirm both phones update.
- Refetch after expiry or admin deactivation; the frame must disappear.
- Avatar frames, cover uploads and room backgrounds must remain unchanged.

## Deployment

Apply migration 20261019030000_room_frames, generate Prisma, rebuild and restart before testing. This change is implemented locally; production and real-device playback are not yet verified. No existing balances or historical records are modified.
