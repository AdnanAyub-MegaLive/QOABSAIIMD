// One-time setup of a Regional Manager: portal staff account + app account perks.
// Dry run by default; add --apply to write. Usage:
//   node scripts/setup-regional-manager.mjs --email someone@example.com --user 2030397 [--apply]
import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
dotenv.config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { permissionTemplates } = await import("../src/lib/portal-permissions.js");
const { assignDefinitionToUser } = await import("../src/lib/special-id.js");
const { syncResellerProps } = await import("../src/lib/reseller-props.js");

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const apply = process.argv.includes("--apply");
const email = String(arg("email") ?? "").trim().toLowerCase();
const appId = String(arg("user") ?? "").trim();
const countries = (arg("countries") ?? "Pakistan,India,Bangladesh,Saudi Arabia").split(",").map(s => s.trim());
const maxGrantDays = Number(arg("days") ?? 7);
const specialCode = arg("special-id") ?? "1111";
const specialDays = Number(arg("special-days") ?? 30);
if (!email || !appId) { console.error("Pass --email and --user."); process.exit(1); }
const log = (...a) => console.log(apply ? "[apply]" : "[dry-run]", ...a);

try {
  const user = await prisma.user.findFirst({ where: { publicId: { in: [appId, `USR-${appId}`, `TLN-${appId}`] }, deletedAt: null } });
  if (!user) throw new Error(`App user ${appId} not found.`);
  log(`App user: ${user.publicId} (${user.name}), country ${user.country ?? "—"}`);
  const root = await prisma.admin.findFirst({ where: { role: "SUPER_ADMIN", active: true }, orderBy: { createdAt: "asc" } });
  if (!root) throw new Error("No active Super Admin to own the staff account.");
  const staffData = { role: "STAFF", active: true, permissions: [...permissionTemplates["Regional Manager"]].sort(),
    allowedCountries: [...countries].sort(), maxGrantDays, linkedUserPublicId: user.publicId };
  const existing = await prisma.admin.findUnique({ where: { email } });
  log(existing ? `Update staff account ${email}` : `Create staff account ${email}`, JSON.stringify(staffData));

  const frames = await prisma.uploadAsset.findMany({ where: { active: true, archivedAt: null, distribution: "ROLE_OFFICIAL" }, select: { publicId: true, name: true, category: true } });
  log(`Official role rewards found: ${frames.length ? frames.map(f => `${f.name} (${f.category})`).join(", ") : "NONE — upload an Official frame with distribution ROLE_OFFICIAL"}`);

  let definition = await prisma.specialIdDefinition.findUnique({ where: { code: specialCode } });
  log(definition ? `Special ID ${specialCode} definition exists` : `Create Special ID definition ${specialCode}`);

  if (apply) {
    if (existing) await prisma.admin.update({ where: { id: existing.id }, data: { ...staffData, sessionVersion: { increment: 1 } } });
    else await prisma.admin.create({ data: { ...staffData, name: user.name, email, createdById: root.id, passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 12) } });
    const roles = [...new Set([...user.appRoles, "OFFICIAL"])];
    await prisma.user.update({ where: { id: user.id }, data: { isOfficial: true, appRoles: roles, grantedPrivileges: [...new Set([...(user.grantedPrivileges ?? []), "INVISIBLE_ENTRY"])] } });
    await syncResellerProps(user.id, prisma);
    if (!definition) definition = await prisma.specialIdDefinition.create({ data: { code: specialCode, category: "STANDARD", defaultDurationMinutes: specialDays * 1440, active: true, storeVisible: false } });
    const current = await prisma.specialIdAssignment.findFirst({ where: { userId: user.id, definitionId: definition.id, status: "ACTIVE", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (!current) await assignDefinitionToUser({ publicId: user.publicId, definitionId: definition.id, durationMinutes: specialDays * 1440, source: "ADMIN" });
    await prisma.auditLog.create({ data: { adminId: root.id, action: "REGIONAL_MANAGER_SETUP", category: "ACCESS_MANAGEMENT", entityType: "User", entityId: user.id,
      description: `Regional Manager set up for ${user.publicId} (${email}).`, metadata: { countries, maxGrantDays, specialCode, specialDays } } });
    globalThis.portalIo?.to?.(`user:${user.publicId}`);
    log("Done. Set his portal password with Accounts & Permissions → Reset password.");
  } else log("Nothing written. Re-run with --apply.");
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
