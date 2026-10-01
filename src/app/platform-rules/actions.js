"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "../../lib/prisma";
import { getProfitSplitRule, validateProfitSplit } from "../../lib/profit-rules";


export async function updateProfitSplit(input) {
  const admin = await requirePermission("rules.manage");
  const values = validateProfitSplit(input);
  const previous = await getProfitSplitRule();
  const rule = await prisma.$transaction(async (tx) => {
    const updated = await tx.profitSplitRule.update({
      where: { id: "GLOBAL" },
      data: {
        ...values,
        version: { increment: 1 },
        updatedByAdminId: admin.id,
      },
    });
    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: "UPDATE_PROFIT_SPLIT",
        category: "FINANCE",
        entityType: "ProfitSplitRule",
        entityId: updated.id,
        description: `${admin.name} updated the platform profit split to host ${values.hostShareBps / 100}%, agency ${values.agencyShareBps / 100}%, and company ${values.companyShareBps / 100}%.`,
        metadata: {
          previousVersion: previous.version,
          newVersion: updated.version,
          previous: {
            hostShareBps: previous.hostShareBps,
            agencyShareBps: previous.agencyShareBps,
            companyShareBps: previous.companyShareBps,
            normalUserReusableShareBps:
              previous.normalUserReusableShareBps,
          },
          current: values,
        },
      },
    });
    return updated;
  });
  revalidatePath("/platform-rules");
  revalidatePath("/audit-logs");
  return { version: rule.version, updatedAt: rule.updatedAt.toISOString() };
}

export async function assignHostToAgency({ subject, agencyId, reason }) {
  const admin = await requirePermission("agencies.manage");
  const [kind, publicId] = String(subject ?? "").split(":");
  const note = String(reason ?? "").trim().slice(0, 500);
  if (!publicId || !["USER", "TALENT"].includes(kind) || !agencyId || !note)
    throw new Error("INVALID_AGENCY_ASSIGNMENT");
  const agency = await prisma.agency.findFirst({
    where: { publicId: agencyId, status: "ACTIVE" },
  });
  if (!agency) throw new Error("AGENCY_NOT_FOUND");
  if (kind === "TALENT")
    await prisma.talent.update({
      where: { publicId },
      data: { agencyId: agency.id },
    });
  else
    await prisma.user.update({
      where: { publicId },
      data: { agencyId: agency.id },
    });
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "ASSIGN_HOST_AGENCY",
      category: "AGENCY_MANAGEMENT",
      entityType: kind === "TALENT" ? "Talent" : "User",
      entityId: publicId,
      description: `${admin.name} assigned ${publicId} to agency ${agency.name}.`,
      metadata: { agencyId: agency.publicId, agencyName: agency.name, reason: note },
    },
  });
  revalidatePath("/platform-rules");
  revalidatePath("/talents");
  revalidatePath("/users");
  revalidatePath("/audit-logs");
}
