import { randomUUID } from "node:crypto";
import { generateNumericPublicId } from "./public-id.js";
import { findAgencyReference, validateAgencyReference } from "./agency-reference.js";
import { normalizeSignupCountry } from "./geo-country.js";
import { agencyReferenceRole } from "./user-roles.js";

export function agencyError(code) { throw new Error(code); }

export function agencyInput(body) {
  const agencyName = String(body?.agencyName ?? "").trim();
  const ownerPublicId = String(body?.ownerPublicId ?? "").trim();
  if (!agencyName || agencyName.length > 120 || !ownerPublicId || ownerPublicId.length > 50)
    agencyError("AGENCY_INPUT_INVALID");
  return { agencyName, ownerPublicId };
}

export async function requireActiveBD(client, id) {
  const user = await client.user.findUnique({ where: { id } });
  if (!user || user.deletedAt || user.status !== "ACTIVE" || !agencyReferenceRole(user)) agencyError("BD_REQUIRED");
  return user;
}

// Run in a Serializable transaction: role validation, unlink and audit commit together.
export async function unlinkBDAgency(client, bdUserId, agencyPublicId) {
  const bd = await requireActiveBD(client, bdUserId);
  const agency = await client.agency.findFirst({ where: { publicId: agencyPublicId, bdUserId: bd.id }, select: { id: true, publicId: true } });
  if (!agency) agencyError("BD_AGENCY_NOT_FOUND");
  const changed = await client.agency.updateMany({ where: { id: agency.id, bdUserId: bd.id }, data: { bdUserId: null } });
  if (!changed.count) agencyError("BD_AGENCY_NOT_FOUND");
  await client.auditLog.create({ data: {
    action: "BD_AGENCY_UNLINKED", category: "AGENCY_MANAGEMENT", entityType: "Agency", entityId: agency.publicId,
    description: `${bd.publicId} unlinked their agency assignment.`,
    metadata: { actorBdUserId: bd.id, actorPublicId: bd.publicId, previousBdUserId: bd.id, bdUserId: null },
  } });
  return { agencyId: agency.publicId, unlinked: true };
}

export async function findBD(client, code, country) {
  return findAgencyReference(client, code, country);
}

async function eligibleOwner(client, publicId, applicationId) {
  const user = await client.user.findUnique({ where: { publicId }, include: { ownedAgency: true } });
  if (!user || user.deletedAt || user.status !== "ACTIVE") agencyError("AGENCY_OWNER_UNAVAILABLE");
  if (user.ownedAgency || user.agencyId) agencyError("ALREADY_HAS_AGENCY");
  const pending = await client.agencyApplication.findFirst({
    where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] }, ...(applicationId ? { id: { not: applicationId } } : {}) },
  });
  if (pending) agencyError("ALREADY_APPLIED");
  return user;
}

async function newAgency(client, user, name, bdUserId) {
  const publicId = await generateNumericPublicId("AGN", candidate => client.agency.findUnique({ where: { publicId: candidate }, select: { id: true } }));
  return client.agency.create({ data: { publicId, name, ownerUserId: user.id, country: normalizeSignupCountry(user.country), bdUserId } });
}

async function audit(client, actor, action, entityId, metadata) {
  await client.auditLog.create({ data: {
    adminId: actor.adminId ?? null, action, category: "AGENCY_MANAGEMENT",
    entityType: "AgencyApplication", entityId,
    description: `${actor.name} ${action.toLowerCase().replaceAll("_", " ")}.`,
    metadata: { ...metadata, actorBdUserId: actor.bdUserId ?? null },
  } });
}

// Call mutations inside a Serializable transaction to protect competing grants/reviews.
export async function grantAgency(client, body, actor) {
  const { agencyName, ownerPublicId } = agencyInput(body);
  const user = await eligibleOwner(client, ownerPublicId);
  const bd = actor.bdUserId ? validateAgencyReference(await requireActiveBD(client, actor.bdUserId), user.country)
    : await findBD(client, body.bdCode, user.country);
  const agency = await newAgency(client, user, agencyName, bd?.id ?? null);
  const application = await client.agencyApplication.create({ data: {
    publicId: `AGA-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    userId: user.id, agencyName, email: user.email, whatsapp: user.phone ?? "",
    country: user.country, bdCode: bd?.publicId ?? "PORTAL", bdUserId: bd?.id ?? null,
    status: "APPROVED", agencyId: agency.id, reviewedAt: new Date(),
    reviewedById: actor.adminId ?? null, reviewedByUserId: actor.bdUserId ?? null,
    reviewNote: "Agency granted directly.",
  } });
  await audit(client, actor, "AGENCY_GRANTED", application.publicId, { ownerPublicId, agencyId: agency.publicId, assignedBdUserId: bd?.id ?? null });
  return { id: agency.publicId, name: agency.name, ownerPublicId, bdCode: bd?.publicId ?? null };
}

export async function reviewAgency(client, applicationId, body, actor) {
  const decision = String(body?.decision ?? "").toUpperCase();
  const note = String(body?.note ?? "").trim();
  if (!["APPROVED", "REJECTED"].includes(decision) || note.length > 1000 || (decision === "REJECTED" && !note)) agencyError("AGENCY_REVIEW_INVALID");
  if (actor.bdUserId) await requireActiveBD(client, actor.bdUserId);
  const current = await client.agencyApplication.findFirst({
    where: { publicId: applicationId, ...(actor.bdUserId ? { bdUserId: actor.bdUserId } : {}) },
    include: { user: true },
  });
  if (!current) agencyError("APPLICATION_NOT_FOUND");
  if (current.status !== "PENDING") agencyError("ALREADY_REVIEWED");
  const user = decision === "APPROVED" ? await eligibleOwner(client, current.user.publicId, current.id) : null;
  if (user) validateAgencyReference(current.bdUserId ? await client.user.findUnique({ where: { id: current.bdUserId } }) : null, user.country);
  const reviewedAt = new Date();
  const changed = await client.agencyApplication.updateMany({
    where: { id: current.id, status: "PENDING" },
    data: { status: decision, reviewedAt, reviewedById: actor.adminId ?? null,
      reviewedByUserId: actor.bdUserId ?? null, reviewNote: decision === "APPROVED" ? note || null : null,
      rejectionReason: decision === "REJECTED" ? note : null },
  });
  if (!changed.count) agencyError("ALREADY_REVIEWED");
  const agency = user ? await newAgency(client, user, current.agencyName, current.bdUserId) : null;
  if (agency) await client.agencyApplication.update({ where: { id: current.id }, data: { agencyId: agency.id } });
  await audit(client, actor, `AGENCY_APPLICATION_${decision}`, current.publicId, { ownerPublicId: current.user.publicId, agencyId: agency?.publicId ?? null, note });
  return { applicationId, status: decision, agency: agency ? { id: agency.publicId, name: agency.name } : null,
    reviewedAt: reviewedAt.toISOString(), reviewNote: decision === "APPROVED" ? note || null : null,
    rejectionReason: decision === "REJECTED" ? note : null };
}

export async function submitAgencyApplication(client, user, input) {
  user = await eligibleOwner(client, user.publicId);
  const bd = await findBD(client, input.bdCode, user.country);
  const rejected = await client.agencyApplication.count({ where: { userId: user.id, bdUserId: bd.id, status: "REJECTED" } });
  if (rejected >= 3) agencyError("ADMIN_ID_ATTEMPT_LIMIT_REACHED");
  const application = await client.agencyApplication.create({ data: {
    publicId: `AGA-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    userId: user.id, agencyName: input.agencyName, whatsapp: input.whatsapp,
    bdCode: bd.publicId, bdUserId: bd.id, email: user.email, country: user.country,
  } });
  await audit(client, { name: user.publicId }, "AGENCY_APPLICATION_SUBMITTED", application.publicId, { bdUserId: bd.id, ownerPublicId: user.publicId });
  return { applicationId: application.publicId, status: application.status, bdCode: bd.publicId, attemptsRemainingForAdminId: Math.max(0, 2 - rejected) };
}
