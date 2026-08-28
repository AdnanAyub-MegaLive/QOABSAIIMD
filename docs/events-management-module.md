# Mega Live Portal Events Management Module

The Events module is part of the existing Next.js portal and uses its existing
PostgreSQL database and Prisma client. It has its own users, JWT session,
refresh tokens, cookies, CSRF token, RBAC rules, navigation, and audit trail.
Parent-portal credentials do not grant Events access.

## Setup

1. Copy the Events variables from `.env.example` into `.env.local`. Use an
   independent, random `EVENTS_JWT_SECRET` of at least 32 characters.
2. Synchronize the existing database:

   ```powershell
   npx prisma generate
   npx prisma db push
   npm run events:seed
   ```

   The repository also contains the incremental SQL migration
   `prisma/migrations/20260730090000_event_management/migration.sql` for
   production environments that already manage Prisma migrations.
3. Start the portal with `npm run dev`, then open `/events-login`.

The development seed creates a Super Admin and a sample draft event. Set
`EVENTS_SUPER_ADMIN_EMAIL` and `EVENTS_SUPER_ADMIN_PASSWORD`; if they are
omitted outside production, the documented local fallback is printed by the
seed command. Never use the fallback in production.

## Routes

- Admin UI: `/events-login`, `/events-management/**`
- Public event: `/event/:slug` and `/event/:slug/**`
- Auth: `POST /events-auth/login|logout|refresh`
- Events: `GET|POST /api/events`, `GET|PUT|DELETE /api/events/:id`
- Workflow: `POST /api/events/:id/publish|unpublish|archive|upload|rollback`
- Super Admin: `/api/event-users/**`, `GET /api/event-logs`

All mutating authenticated requests require the readable
`streamline_events_csrf` cookie value in the `x-events-csrf` header. Access
and refresh credentials are separate secure HTTP-only cookies.

## Upload contracts

For an archive, send multipart form data with `name`, `slug`, and `archive`.
For a folder, append every file under `files` and its matching relative path
under `paths`. Version uploads use the same fields except name/slug:

```text
POST /api/events/:id/upload
files=<File>
paths=SummerSale/index.html
files=<File>
paths=SummerSale/images/banner.webp
```

ZIP and RAR archives are extracted in memory, validated, and written into a
random staging directory. Only after the entire upload passes path, extension,
MIME, file-count, size, duplicate-name, and root `index.html` validation is it
atomically moved to `storage/events/<stable-folder>/v<number>`. Temporary
directories are never publicly routed.

## Versioning and publishing

Every upload creates an immutable `EventVersion`. `Event.version` points at
the active version; rollback changes that pointer and preserves all files.
Published events resolve the active version from PostgreSQL. Draft, archived,
or missing events return 404 by default. Set
`EVENTS_UNPUBLISHED_MODE=maintenance` for a 503 maintenance page.

## Deployment notes

The event storage directory must be persistent and shared by every portal
instance. A container's ephemeral filesystem is not sufficient. For
multi-instance deployment, mount the same network volume or replace the
storage adapter with object storage while retaining the `EventVersion`
metadata contract.

Reverse proxies must preserve `Cookie`, `x-events-csrf`,
`x-forwarded-for`, and byte-range behavior for media. Terminate TLS in
production so secure cookies are enforced.

## Roles

- `SUPER_ADMIN`: all event workflows, rollback/delete, users, password resets,
  logs, and settings.
- `JUNIOR_ADMIN`: list, upload, replace, publish, and unpublish events only.

Run `npm test`, `npm run lint`, and `npm run build` before deployment.
