# Prohibited chat words

Manage the list under **Rules & Profit Split → Prohibited Words**. Reading requires
`rules.view`; saving requires `rules.manage`. Changes are audited and revision-checked
to prevent one administrator overwriting another's changes unnoticed.

The list starts empty. Enter one word or phrase per line (500 entries maximum,
100 characters per entry). Matching uses Unicode NFKC, lowercase, removal of
invisible format characters and normalized whitespace, with Unicode word boundaries.
Entries are literal text, not regular expressions. Add spelling variants separately;
this is a configured word filter, not semantic/AI moderation.

Server enforcement covers audio-room chat and direct/group/world message creation
and editing through shared REST/Socket.IO services. Messages are rejected before
storage or broadcast. No historical messages are removed. Profiles, posts and
administrator system notifications are not chat and are unchanged.

REST rejects with HTTP 422; Socket.IO sends the same error in its acknowledgement:

```json
{"success":false,"error":{"code":"INAPPROPRIATE_WORD","message":"Your message contains an inappropriate word. Please edit it before sending."}}
```

Mobile must display `error.message`, keep the draft editable, and remove any
optimistic message on rejection. Do not retry automatically. The rejected word/list
is not exposed. No mobile-only filter can replace this server check.

Deployment: apply Prisma migrations, regenerate the client, build, and restart the
custom server. Each send reads the shared policy; no worker-local cache delays changes.
