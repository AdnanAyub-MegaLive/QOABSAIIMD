# Agency membership: Android / RN handoff

Audio hosts do not need KYC. Agency membership acceptance immediately grants the
HOST role and agency membership. KYC (`isVerified`) is neither granted nor removed
by membership actions. Live video still requires an active HOST and approved KYC;
its start/token routes return 403 LIVE_KYC_REQUIRED otherwise. Withdrawal checks
are unchanged; this change does not remove financial verification requirements.

All endpoints below require the existing Bearer mobile token and use
`{success:true,data:...}` / `{success:false,error:{code,message}}` envelopes.

## User requests membership

POST `/api/agencies/{agencyPublicId}/join`, no body needed.
201 data: `{requestId,status:"PENDING",direction:"USER_REQUEST"}`.
GET `/api/agencies/my-join-request` returns the existing request status contract.
GET `/api/agencies/mine` returns the owner's pending user requests in its existing
join-request list; invitations are excluded so they cannot be mistaken for requests.
Only that agency owner can accept/reject a user request.

## Owner invites user

POST `/api/agencies/invitations`, body `{ "userPublicId": "USR-123123" }`.
Agency is resolved from the signed-in owner; do not send an owner or agency ID.
201 data: `{requestId,status:"PENDING",direction:"OWNER_INVITE"}`.
GET `/api/agencies/invitations` returns `{invitations:[{requestId,direction,status,
createdAt,user:{publicId,name,profileImage},agency:{publicId,name}}]}`.
For users this lists received invitations; for owners it lists their sent ones.
Newest first, up to 100. Only the invited user can accept/reject an invitation;
the owner or portal administrator cannot accept on their behalf.
The legacy portal PATCH join-request review endpoint now returns 403
MEMBERSHIP_CONSENT_REQUIRED; portal staff cannot substitute for either party.

## Respond in either direction

POST `/api/agencies/join-requests/{requestId}/respond`
body `{ "accept": true }` or `{ "accept": false }`.
200 data: `{requestId,status:"APPROVED"|"REJECTED",direction,previousUserId,
userId,agencyId,sessionInvalidated}`.
The receiving party is checked on the server, never inferred from client UI.
Approval changes USR-123123 to TLN-123123 (same suffix) and grants HOST immediately,
even when isVerified is false. If the public ID changes the existing session is
invalidated. `host:approved` is emitted to the old private user channel with the
same data object (not an envelope). Reauthenticate and reload profile/permissions;
do not keep using the old ID/token. REST response is authoritative if the socket
notification is missed. Refetch pending lists on foreground/after responding;
creation currently does not emit an invitation notification.

Errors: 403 FORBIDDEN (wrong responder), 404 AGENCY_NOT_FOUND / USER_NOT_FOUND /
REQUEST_NOT_FOUND, 409 ALREADY_HAS_AGENCY / ALREADY_REQUESTED /
REQUEST_ALREADY_RESOLVED / AGENCY_INACTIVE / MEMBERSHIP_CONFLICT, 422 VALIDATION_ERROR.
Existing session/device/account-ban errors are preserved. Refresh on conflict;
never retry an accept automatically as a new request. One pending membership
offer per user is allowed. Rejected offers allow a new request/invitation.

## App UI

- Audio host entry: request an agency or accept an agency invitation; no KYC step.
- Owner: pending requests with Accept/Reject, and Invite User with sent status.
- User: received invitations with Accept/Reject, separate from outgoing requests.
- Live-video entry: continue showing KYC requirement when unverified.
- Do not interpret HOST/TLN identity as evidence of KYC completion.

Deployment: apply migrations, generate Prisma and restart the server. Legacy
isVerified flags are not mass-cleared: old agency approvals may have set them.
Those accounts need an evidence-based KYC review before relying on legacy flags
for live-video access. No genuine completed KYC is erased by this release.
