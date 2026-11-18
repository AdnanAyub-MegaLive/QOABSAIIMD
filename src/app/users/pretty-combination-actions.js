"use server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { revalidatePath } from "next/cache";
import { occupiedSpecialId } from "@/lib/special-id-ownership";
import { addCombinationIds, prettyCombinationInput, serializeCombination, syncCombinationIds } from "@/lib/pretty-id-store";

const withIds = { ids: { where: { active: true }, orderBy: { code: "asc" }, include: { assignments: { where: occupiedSpecialId(new Date()), select: { id: true } } } } };

export async function listPrettyCombinations() {
  await requirePermission("users.specialIds");
  const rows = await prisma.prettyIdCombination.findMany({ where: { active: true }, orderBy: [{ pattern: "asc" }], include: withIds });
  return rows.map(serializeCombination);
}

export async function savePrettyCombination(id, values) {
  const admin = await requirePermission("users.specialIds");
  let data;
  try { data = prettyCombinationInput(values ?? {}); } catch (error) { return { success: false, message: error.message }; }
  const existing = await prisma.prettyIdCombination.findUnique({ where: { pattern: data.pattern } });
  if (existing && existing.id !== id && (existing.active || id)) return { success: false, message: `The combination ${data.pattern} already exists.` };
  if (id) {
    const current = await prisma.prettyIdCombination.findUnique({ where: { id }, include: { ids: { where: { active: true }, select: { id: true } } } });
    if (current && current.pattern !== data.pattern && current.ids.length) return { success: false, message: "Remove this combination's IDs before changing its pattern." };
  }
  const row = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
    const saved = id
      ? await tx.prettyIdCombination.update({ where: { id }, data })
      : existing
        ? await tx.prettyIdCombination.update({ where: { id: existing.id }, data: { ...data, active: true } })
        : await tx.prettyIdCombination.create({ data });
    await syncCombinationIds(tx, saved);
    await tx.auditLog.create({ data: { action: "PRETTY_COMBINATION_SAVED", category: "USER_MANAGEMENT", entityType: "PrettyIdCombination", entityId: saved.id, description: "ID combination saved", metadata: { adminId: admin.id, pattern: saved.pattern, price: saved.coinPrice.toString(), durationDays: saved.durationDays, storeVisible: saved.storeVisible } } });
    return saved;
  });
  revalidatePath("/users");
  return { success: true, message: `Saved ${row.pattern}. Its IDs now use this price, validity and Mall setting.` };
}

export async function addPrettyCombinationIds(id, text) {
  const admin = await requirePermission("users.specialIds");
  if (typeof id !== "string" || !id || typeof text !== "string") return { success: false, message: "Choose a combination and enter IDs." };
  let result;
  try {
    result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
      const combination = await tx.prettyIdCombination.findUnique({ where: { id } });
      if (!combination?.active) throw Object.assign(new Error("This combination was removed."), { status: 409 });
      const out = await addCombinationIds(tx, combination, text);
      if (out.added.length) await tx.auditLog.create({ data: { action: "PRETTY_COMBINATION_IDS_ADDED", category: "USER_MANAGEMENT", entityType: "PrettyIdCombination", entityId: id, description: "IDs added to a combination", metadata: { adminId: admin.id, pattern: combination.pattern, codes: out.added } } });
      return out;
    });
  } catch (error) { if (error.status) return { success: false, message: error.message }; throw error; }
  revalidatePath("/users");
  const parts = [`Added ${result.added.length} ID${result.added.length === 1 ? "" : "s"}.`];
  if (result.taken.length) parts.push(`Already in use: ${result.taken.join(", ")}.`);
  if (result.wrong.length) parts.push(`Do not fit the pattern: ${result.wrong.join(", ")}.`);
  return { success: result.added.length > 0, message: parts.join(" ") };
}

export async function removePrettyCombinationId(definitionId) {
  const admin = await requirePermission("users.specialIds");
  if (typeof definitionId !== "string" || !definitionId) return { success: false, message: "Choose an ID." };
  const definition = await prisma.specialIdDefinition.findUnique({ where: { id: definitionId }, include: { assignments: { where: occupiedSpecialId(new Date()), select: { id: true } } } });
  if (!definition?.combinationId) return { success: false, message: "This ID is not part of a combination." };
  if (definition.assignments.length) return { success: false, message: `${definition.code} is owned by a user and cannot be removed now.` };
  await prisma.$transaction(async tx => {
    await tx.specialIdDefinition.update({ where: { id: definitionId }, data: { active: false, storeVisible: false } });
    await tx.auditLog.create({ data: { action: "PRETTY_COMBINATION_ID_REMOVED", category: "USER_MANAGEMENT", entityType: "SpecialId", entityId: definitionId, description: "ID removed from a combination", metadata: { adminId: admin.id, code: definition.code } } });
  });
  revalidatePath("/users");
  return { success: true, message: `Removed ${definition.code} from the Mall.` };
}

export async function removePrettyCombination(id) {
  const admin = await requirePermission("users.specialIds");
  if (typeof id !== "string" || !id) return { success: false, message: "Choose a combination." };
  await prisma.$transaction(async tx => {
    const row = await tx.prettyIdCombination.update({ where: { id }, data: { active: false, storeVisible: false } });
    await syncCombinationIds(tx, row);
    await tx.auditLog.create({ data: { action: "PRETTY_COMBINATION_REMOVED", category: "USER_MANAGEMENT", entityType: "PrettyIdCombination", entityId: id, description: "ID combination removed from the Mall", metadata: { adminId: admin.id, pattern: row.pattern } } });
  });
  revalidatePath("/users");
  return { success: true, message: "Removed. Its IDs are hidden from the Mall; users who already own one keep it." };
}
