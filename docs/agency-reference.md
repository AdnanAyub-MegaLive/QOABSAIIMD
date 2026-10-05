# Country-scoped agency references

## BD unlink

`DELETE /api/v1/bd/agencies/{agencyId}` requires the BD's mobile Bearer token. Only an active BD assigned through `Agency.bdUserId` can unlink. Success: `{"success":true,"data":{"agencyId":"AGN-123","unlinked":true}}`. Refresh the BD agency list after success.

This clears only the agency's current BD assignment and writes an audit entry atomically. Agency status, owner, hosts, country, balances, settlements and original application reference remain intact. The owner dashboard then returns `bdReference: null`. Another BD, an unknown agency, or a repeat unlink returns `404 BD_AGENCY_NOT_FOUND`; a non-BD returns 403. Concurrent changes may return 409; refresh before retrying. Reassignment remains a portal `agencies.manage` operation.

`GET /api/v1/bds?q=&country=` authenticates the applicant and filters using their saved country. The query country is ignored. Missing applicant country returns an empty list. Search stays inside the active, non-deleted, same-country eligible set. Country assignments use User.country (ISO-2).

Eligibility comes from `APPLICATION_ROLE_PERMISSIONS` in `src/lib/user-roles.js`: roles carrying `agencies.reference`. Initial roles: BD, JUNIOR_ADMIN, SENIOR_ADMIN, SUPER_ADMIN, COUNTRY_HEAD. This does not grant portal staff access or agency review powers.

Each `data.bds` item returns `publicId`, `name`, `profileImage`, `frameUrl`, `role`, `roleLabel`, `country`. Frames use signed display URLs. Apply sends only `bdCode` as the reference public ID; request country, status and role never determine eligibility.

Apply, direct grant and approval validate against the owner's current country. New agencies snapshot that country. Reference changes validate against stored Agency.country. Unknown reference: 404 BD_REFERENCE_INVALID. Inactive, deleted, ineligible, missing-country or wrong-country: 422 BD_REFERENCE_INVALID. Direct portal grants now require a reference. BD grants use the authenticated BD as reference and require the same country.

`PATCH /api/admin/agencies/{agencyId}/reference` accepts `{ "bdCode": "USR-123" }`, requires portal `agencies.manage`, and atomically audits and updates Agency.bdUserId. Original applications retain their original reference for history.

`GET /api/agencies/mine` includes `agency.country` and `agency.bdReference`; `GET /api/agencies/my-application` includes `application.bdReference`. Reference DTOs include current profile, frame, role label and country. Deleted references become null through existing FK behavior. Eligibility is rechecked on mutations, not used to erase historical reference display.

Migration backfills Agency.country from its owner where available. Ownerless or country-less legacy agencies remain null and require data remediation before reference reassignment.
