# Management hierarchy — Phase 1/2

Implemented 2026-10-05. This is the backend contract; Android UI changes are separate.

## Roles and access

Existing `roles` arrays remain compatible. MANAGER is now an application role, not a portal administrator credential. Login, Google login, registration and profile/session/refresh `user` objects additionally contain:

```json
{"management":{"enabled":true,"role":"JUNIOR_ADMIN","roleLabel":"Junior Admin","countryHeadDesignation":null,"permissions":["team.view","team.assign","team.remove"]}}
```

Highest held management role determines supervisor policy. BD alone does not open Management Center. Server actions always reload current roles; cached client roles cannot grant authority. Portal role edits emit `user:roles-changed` with `{success:true,data:{publicId,roles,management}}`. Clients should refresh the authenticated profile on that event and foreground/session validation; no logout is required. Socket events are not durable, so session refresh remains the recovery path.

Country Head designation accepts TITLED or ACTUAL. It is metadata only until their differing powers are approved.

## Team endpoints

All require the standard Bearer mobile session, account/device validation and v1 envelope/headers. GET is limited to 60 requests/minute; writes to 20/minute through the existing v1 limiter.

| Endpoint | Request | `data` |
|---|---|---|
| GET `/api/v1/team` | none | `{me,limits,members,policy}` |
| GET `/api/v1/team/candidates?role=BD&q=` | Requested role, optional search | `{candidates: Person[]}` (up to 100) |
| POST `/api/v1/team/assign` | `{userPublicId,role}` | `{publicId,supervisorId,role}` |
| DELETE `/api/v1/team/{userPublicId}` | none | `{publicId,supervisorId:null,removed:true}` |

Person: `{publicId,name,profileImage,frameUrl,role,roleLabel,country,supervisorId,status,countryHeadDesignation}`. Images/designation/supervisor can be null. IDs are strings. `members` is a flat whole-subtree list, with public supervisor IDs. Deleted and cross-country records are not exposed. Capacity still includes assigned inactive/deleted users until explicitly detached.

Limits: `{role,roleLabel,used,max}`; null max means unlimited. A requested role is a selector, never a role grant: the server checks the target already holds it. Each assignment records its capacity role (`teamRole`) to make multi-role membership deterministic.

Errors use `{success:false,error:{code,message}}`: TEAM_ROLE_NOT_ALLOWED 403, TEAM_LIMIT_REACHED 409, TEAM_MEMBER_TAKEN 409, TEAM_COUNTRY_MISMATCH 422, TEAM_INPUT_INVALID 422. Concurrent serializable conflicts return TEAM_CONFLICT 409: reload the tree and retry. Standard session/ban/rate errors remain unchanged.

Assignments validate active/nondeleted target, server-stored country, no supervisor, downward hierarchy, no cycles, and capacity in one serializable transaction. SUBTREE policy also checks affected ancestor limits. Removal keeps the removed member's own descendants intact. Assign/remove are audited transactionally.

## Portal configuration

Open **Rules & Profit Split → Management hierarchy**. Viewing needs `rules.view`; editing needs `rules.manage`.

- Seeded limits match the proposal: ADMIN BD2; Junior ADMIN1/BD4; Senior Junior3/ADMIN6/BD12; Super Senior2/Junior6/ADMIN12/BD24; Country Head Super unlimited.
- Default: DIRECT counts and direct-supervisor-only removal. Both are editable settings, not environment variables.
- Reporting rules can be added/removed; blank maximum is unlimited, zero disables additions.
- Manager has no seeded assignment quota because the proposal does not define one. An authorized portal administrator may explicitly add a Manager → Country Head rule.
- Lowering limits or changing scope does not silently detach existing members; over-capacity teams cannot grow until resolved.
- Country Head designation is set by public ID on the same screen and audited.

## Deployment and tests

Run `npx prisma migrate deploy`, `npx prisma generate`, restart `node server.js` (or local `npm run dev`). Migration seeds the policy tables without changing existing user roles or assigning supervisors.

`npm test` covers country, roles, limits, ancestor limits, subtree output and removal. `node scripts/test-management-team-db.mjs` verifies real database writes/audit inside a transaction that is rolled back. `node scripts/test-team-http.mjs` checks the running local server using temporary accounts and removes its fixtures afterwards; set TEST_PORTAL_URL to use a different local/staging address.

## Not included in this phase

Team performance aggregation, podium/month filters, new mobile Super Admin ban APIs, Country Head prop price groups/monthly grants, management transfers, and a separate Country Head portal. Existing unrelated portal tools retain their existing authorization. Calendar versus rolling month, per-item versus aggregate grant limits, and Titled/Actual powers need explicit product decisions before implementation.
