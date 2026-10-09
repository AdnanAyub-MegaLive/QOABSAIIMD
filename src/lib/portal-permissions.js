// Shared vocabulary: every assignable key must have a server enforcement point.
export const permissionGroups = [
  ["vip", "VIP Management", [["view", "View VIP tiers and memberships"], ["manage", "Create tiers and grant or revoke timed VIP memberships"]]],
  ["dashboard", "Dashboard", [["view", "View platform overview and statistics"]]],
  ["users", "Users / Senders", [["view", "View user profiles and records"], ["edit", "Edit user profiles and application roles"], ["create", "Create application accounts"], ["verify", "Verify users / official status"], ["ban", "Ban or unban accounts"], ["devices", "Ban or unban devices"], ["logout", "Force user logout"], ["password", "Reset user passwords"], ["delete", "Delete user accounts"], ["specialIds", "Manage special IDs"], ["props", "Grant or revoke user props"]]],
  ["hosts", "Host Management", [["view", "View hosts, earnings and records"], ["manage", "Edit hosts, approvals and agency membership"], ["salary", "Change host salary"]]],
  ["agencies", "Agency Management", [["view", "View agency records and applications"], ["manage", "Review applications and assign hosts"]]],
  ["finance", "Finance & Wallet", [["view", "View balances, ledger and reconciliation"], ["withdrawals", "Review withdrawals and record payouts"], ["adjust", "Adjust user wallet balances"]]],
  ["rules", "Rules & Profit Split", [["view", "View profit rules"], ["manage", "Change profit rules"]]],
  ["uploads", "Uploads", [["view", "View assets"], ["manage", "Upload and edit assets"], ["delete", "Delete assets"]]],
  ["rooms", "Room Management", [["view", "View rooms, members, chat and moderation records"], ["manage", "Change settings, chat controls and room restrictions"]]],
  ["tasks", "Daily Tasks", [["view", "View tasks and categories"], ["manage", "Change tasks, rewards and categories"]]],
  ["envelopes", "Red Envelopes", [["view", "View presets and limits"], ["manage", "Change presets and limits"]]],
  ["appearance", "Room Appearance", [["view", "View pricing and artwork submissions"], ["manage", "Change prices and approve/reject artwork"]]],
  ["roomGames", "Room Games", [["view", "View game links"], ["manage", "Create/edit links, order and visibility"]]],
  ["games", "Games Management", [["view", "View games and round records"], ["manage", "Change game odds, limits and availability"]]],
  ["video", "Live Video", [["view", "View video sessions and guests"], ["manage", "Moderate and end live sessions"]]],
  ["notifications", "Notification Center", [["view", "View notifications"], ["manage", "Publish notifications"]]],
  ["content", "Content & Social Safety", [["view", "View posts, blocks and friend requests"]]],
  ["rankings", "Rankings", [["view", "View rankings"]]],
  ["messages", "Message History", [["view", "View room and private message history (sensitive)"]]],
  ["audit", "Audit Logs", [["view", "View administrator activity"]]],
  ["accounts", "Accounts & Permissions", [["view", "View managed staff accounts"], ["create", "Create staff accounts"], ["manage", "Edit staff access and suspend/reactivate accounts"], ["reset", "Reset staff passwords / revoke sessions"]]],
].map(([key, label, actions]) => ({ key, label, permissions: actions.map(([action, label]) => ({ key: `${key}.${action}`, label })) }));

export const allPermissions = permissionGroups.flatMap(group => group.permissions.map(p => p.key));
const knownPermissions = new Set(allPermissions);
export function hasPermission(admin, permission) {
  return Boolean(admin?.active && (admin.role === "SUPER_ADMIN" || admin.permissions?.includes(permission)));
}
export function validatePermissions(value, actor) {
  if (!Array.isArray(value) || value.length > allPermissions.length || value.some(p => typeof p !== "string" || !knownPermissions.has(p)))
    throw Object.assign(new Error("Select only supported permissions."), { status: 422 });
  const permissions = [...new Set(value)];
  if (permissions.some(p => !hasPermission(actor, p)))
    throw Object.assign(new Error("You cannot grant permissions you do not have."), { status: 403 });
  for (const p of permissions) {
    const view = `${p.split(".")[0]}.view`;
    if (!permissions.includes(view)) throw Object.assign(new Error(`Enable ${view} before granting its actions.`), { status: 422 });
  }
  return permissions.sort();
}

export const pagePermissions = {
  "/vip-management": "vip.view",
  "/home": "dashboard.view", "/users": "users.view", "/talents": "hosts.view", "/agencies": "agencies.view",
  "/finance": "finance.view", "/platform-rules": "rules.view", "/uploads": "uploads.view", "/room-management": "rooms.view",
  "/daily-tasks": "tasks.view", "/red-envelopes": "envelopes.view", "/room-appearance": "appearance.view", "/room-games": "roomGames.view",
  "/games-management": "games.view", "/games/preview": "games.view", "/live-video-management": "video.view", "/live-management": "video.view",
  "/notifications-management": "notifications.view", "/content-moderation": "content.view", "/rankings": "rankings.view",
  "/messages": "messages.view", "/audit-logs": "audit.view", "/accounts-permissions": "accounts.view",
};
export function permissionForPage(href) {
  const pathname = href.split("?")[0];
  return Object.entries(pagePermissions).find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1];
}
export function canAccessPage(admin, href) {
  if (href.startsWith("/events")) return admin?.role === "SUPER_ADMIN";
  const permission = permissionForPage(href);
  return Boolean(permission && hasPermission(admin, permission));
}

export const permissionTemplates = {
  "Read only": allPermissions.filter(p => p.endsWith(".view") && !["accounts.view", "messages.view", "finance.view", "audit.view"].includes(p)),
  "Room moderator": ["rooms.view", "rooms.manage", "video.view", "video.manage"],
  "Content manager": ["uploads.view", "uploads.manage", "appearance.view", "appearance.manage", "notifications.view", "notifications.manage"],
  "Finance officer": ["finance.view", "finance.withdrawals"],
};
