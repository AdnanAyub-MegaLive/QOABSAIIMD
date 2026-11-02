# Accounts and permissions audit — 2 November 2026

Status: local changes only. No production staff grants, user records, balances or history were modified during this audit.

## Confirmed bypass and correction

`/users/{publicId}` previously checked `users.view`, then queried private/direct messages, world messages, room messages and notifications unconditionally. Removing `messages.view` hid the main Message History section but did not secure the user's profile preview.

The profile now uses a permission-aware server loader. Without `messages.view`, no message/history queries execute and no history is serialized into the page. Notification history additionally requires `notifications.view`. The history component is also gated against the latest client access state. The separate `/messages` page already enforces the sensitive permission on the server.

## Grant and revocation flow

- Each protected API/server action must authorize the requested action, independently of the sidebar or button visibility.
- Staff grants are reloaded from the database per request. Suspension, session version and the creating manager's effective permissions are checked.
- Staff edits increment sessionVersion; old sessions fail authentication. Revoked parent permissions also restrict descendants without editing their saved grants.
- Account editing and permission assignment are distinct: `accounts.edit` does not permit changing roles/grants without `accounts.permissions`.
- Self-editing, Super Admin promotion through staff forms and changes to protected parent accounts remain forbidden.
- The client rechecks access on focus, page restore, tab visibility and every 15 seconds. Invalid sessions leave the protected page; changed effective permissions refresh server content. A sensitive section is hidden when its grant is absent. This cannot retract information already seen or copied before revocation.

## Detailed controls

The granular-permission implementation provides separate supported Create, Edit, Delete/Archive and specialized actions per module. The separate CSV export implementation remains pending. View is required to open a module but does not grant its mutations. The Accounts form now includes a per-section Read only shortcut and explicitly explains sensitive message access.

Existing legacy `.manage` grants retain their historical authority. Editing an account expands these into visible individual selections, allowing the admin to remove actions explicitly. No migration rewrites existing grants. New delete-only access still requires the module's View permission.

The review also separated room-banner deletion from editing (`appearance.delete` versus `appearance.edit`). Profile-cover approval/rejection uses `content.edit`; removal uses `content.delete`. Their action controls now reflect access. Task, upload, VIP, game catalogue and notification lifecycle endpoints use their distinct supported action checks. Room moderation uses `rooms.edit`; removing a participant or revoking a ban is a moderation action, not deleting a database account.

Database Management is not assignable: it remains exclusive to the designated Platform Admin account `admin@megachat.live`. Event administration retains its separate authentication boundary.

## Validation and limits

48 focused tests pass across history loading, session revocation, permission vocabulary, delegation, account edits, room-banner deletion, post review, catalogue retirement and room routes. ESLint passes for changed files. Build verification is recorded under `output/permission-audit-build-final.log`.

This is a source/server-authorization audit with automated fixtures, not a production impersonation test of every control. No existing staff account was modified to test revocation. After deployment, verify with dedicated staff accounts: View-only, View+Edit, View+Delete, no Message History grant, revoked Message History grant in an already-open profile tab, and a subordinate whose manager loses a grant. Already loaded data cannot be remotely erased from a browser's memory; server responses must remain denied regardless of UI refresh.

The wider cycle/export work remains separate in the working tree and is excluded from this permission release.
