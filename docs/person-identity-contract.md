# Person identity contract

All new mobile responses, socket events, notification actions and history records
that name an application user must include their public ID alongside the name.
Prefer `{ publicId, name, profileImage }` under a named role (`actor`, `sender`,
`recipient`, `person`, `partner`). Preserve existing fields for older clients.
Never resolve a profile from a display name, internal database ID, or array index.
Portal-only administrators without an application profile have no public ID;
clients must not treat their administrator ID as a profile ID.

## Room mentions

The `audio-room:message` send payload accepts an optional `mentions` array:

```json
{"body":"hi @Ali","mentions":[{"publicId":"USR-123","start":3,"end":7}]}
```

Offsets are UTF-16 code units (JavaScript/Kotlin string indices), start inclusive,
end exclusive, covering the complete `@name`. They refer to the submitted body.
The server validates active room membership, the current display name, bounds and
non-overlap; at most 20 mentions. It trims the body and adjusts saved offsets.
Acknowledgements, live messages and history return:

```json
{"body":"hi @Ali","mentions":[{"publicId":"USR-123","name":"Ali","start":3,"end":7}]}
```

Clients must retain the selected user's ID in the composer and render clickable
spans from returned metadata. Old messages and plain-text mentions return `[]`;
ambiguous names are never guessed. Apply the additive room_message_mentions
migration before starting this server version. No historical text backfill.

## Other payloads

- Event rankings: `person.publicId`, `partner.publicId`, and top-level person
  `publicId` (agency entries retain their separate agency `id`).
- Multi-recipient gifts: each `recipients` item includes `publicId`, `name` and
  the existing `recipientId`.
- Prop gift and reseller top-up notification actions: `sender` identity.
- Agency application notification actions: `actor` identity.
- Group change system messages: `metadata.actor` and `metadata.people`.
- Existing room invitations use `inviter.publicId`; existing global banners use
  `actor.publicId` and, for gifts, `recipient.publicId`. Preserve these objects
  when composing banner sentences rather than reducing them to plain text.

Existing historical notification text is not parsed to invent missing IDs.
