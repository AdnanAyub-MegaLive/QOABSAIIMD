# Official roles and graphic tags

Apply the `20261012120000_support_roles` migration, regenerate Prisma and restart before rollout.

## Portal

- Assign CS / CS Leader using the existing user role editor.
- Upload a BADGES asset and choose the appropriate role reward distribution. Every application role has an option; Reseller remains backward compatible.
- The latest updated active BADGES asset for a role supplies its graphic identity tag. Disabling it removes it from future responses. No asset means a null image, not fabricated artwork.
- Other role reward artwork uses existing inventory/equip behavior. Independent purchases/manual grants remain intact when a role is removed.
- Management Hierarchy includes CS Leader → CS (initially unlimited, editable). CS cannot supervise; CS Leader cannot supervise business roles or manage agencies.

## Mobile

`GET /api/v1/officials?page=1&q=&role=CS` requires the existing Bearer session. Optional role filter; 20 entries per page. Returns standard envelope with `data: {page, hasMore, items}`. Items contain publicId, name, country, profileImage, frameUrl, roles and roleTags. Inactive, deleted and currently banned accounts are excluded. No contact details or salary data are exposed.

Public profile `GET /api/v1/users/{publicId}/profile` and team person DTOs now include:

```json
{"roleTags":[{"role":"CS","roleLabel":"Customer Support","assetId":"AST-123","imageUrl":"https://portal.example/signed-display","mimeType":"image/png"}]}
```

Use imageUrl/mimeType to render the tag; retain roleLabel for accessibility. An absent asset has null assetId, imageUrl and mimeType. Graphic tags do not replace the equipped badge. Refresh the profile after a role update.

CS Leader uses existing GET `/api/v1/team`, candidates, assign and remove endpoints. Its limits report `CS` with server-calculated used/max, and members provide the reporting list. Keep authorization server-side.

## Salary targets — draft only

Management Hierarchy saves target Coins, salary amount, currency and OWN/SUBTREE attribution choices per BD/Admin/Junior Admin/Senior Admin/Super Admin/Country Head. These settings are audited but do not credit wallets or accrue salary.

Before enabling calculation, confirm period, which committed recharge/reseller transactions count as sales, ownership attribution, whole-team versus personal scope, fixed-versus-proportional salary and currency. Refund treatment and duplicate credit prevention must be defined. No unapproved financial defaults are applied.
