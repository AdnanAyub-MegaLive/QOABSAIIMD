"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { canSupervise } from "@/lib/management-team";
import { managementIdentity } from "@/lib/user-roles";
import { emitToUser } from "@/lib/realtime";

export async function saveTeamPolicy(input) {
  const admin = await requirePermission("rules.manage");
  if (!["DIRECT", "SUBTREE"].includes(input.limitScope) || typeof input.allowAncestorRemoval !== "boolean" || !Array.isArray(input.limits) || input.limits.length > 30) throw new Error("Invalid team policy.");
  const keys = new Set();
  const limits = input.limits.map(({ supervisorRole, memberRole, max }) => {
    const key = `${supervisorRole}:${memberRole}`;
    if (!canSupervise(supervisorRole, memberRole) || keys.has(key) || (max !== null && (!Number.isSafeInteger(max) || max < 0 || max > 100000))) throw new Error("Choose unique reporting roles and non-negative limits.");
    keys.add(key); return { supervisorRole, memberRole, max };
  });
  await prisma.$transaction(async tx => {
    await tx.roleTeamLimit.deleteMany({});
    if (limits.length) await tx.roleTeamLimit.createMany({ data: limits });
    const policy = { limitScope: input.limitScope, allowAncestorRemoval: input.allowAncestorRemoval };
    await tx.teamPolicy.upsert({ where: { id: "GLOBAL" }, create: { id: "GLOBAL", ...policy }, update: policy });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "UPDATE_TEAM_POLICY", category: "USER_MANAGEMENT", entityType: "TeamPolicy", entityId: "GLOBAL", description: "Updated reporting limits and removal policy. Existing assignments retained.", metadata: { ...policy, limits } } });
  }, { isolationLevel: "Serializable" });
  revalidatePath("/platform-rules");
}

export async function setCountryHeadDesignation(input) {
  const admin = await requirePermission("rules.manage");
  if (!["TITLED", "ACTUAL"].includes(input.designation) || typeof input.publicId !== "string") throw new Error("Enter a Country Head ID and designation.");
  const user = await prisma.$transaction(async tx => {
    const target = await tx.user.findUnique({ where: { publicId: input.publicId.trim() } });
    if (!target || target.deletedAt || !target.appRoles.includes("COUNTRY_HEAD")) throw new Error("This user must already hold the Country Head role.");
    const updated = await tx.user.update({ where: { id: target.id }, data: { countryHeadDesignation: input.designation } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "COUNTRY_HEAD_DESIGNATION", category: "USER_MANAGEMENT", entityType: "User", entityId: target.publicId, description: `Country Head designation set to ${input.designation}.`, metadata: { previous: target.countryHeadDesignation, designation: input.designation } } });
    return updated;
  });
  emitToUser(user.publicId, "user:roles-changed", { success: true, data: { publicId: user.publicId, roles: user.appRoles, ...managementIdentity(user) } });
  revalidatePath("/platform-rules");
}
