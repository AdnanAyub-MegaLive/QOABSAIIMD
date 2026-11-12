import { videoError } from "./video-access.js";
import { notifyAction } from "./action-notifications.js";
export function kycDto(user, row) {
  return { status: row?.status || "NONE", isVerified: Boolean(user.isVerified), rejectionReason: row?.rejectionReason || null, submittedAt: row?.submittedAt?.toISOString() || null, reviewedAt: row?.reviewedAt?.toISOString() || null, idType: row?.supportingFiles?.idType || null };
}
export async function kycIdentity(db, user) {
  const talent = await db.talent.findUnique({ where: { publicId: user.publicId }, select: { id: true } });
  return { talent, where: { OR: [{ userId: user.id }, ...(talent ? [{ talentId: talent.id }] : [])] } };
}
export async function readKyc(db, user) {
  const { where } = await kycIdentity(db, user);
  return kycDto(user, await db.talentVerification.findFirst({ where, orderBy: [{ submittedAt: "desc" }, { id: "desc" }] }));
}
export function validateKycFields(legalName, idType) {
  if (typeof legalName !== "string" || legalName.trim().length < 3 || legalName.trim().length > 80) throw videoError("VALIDATION_ERROR", "Legal name must be 3–80 characters.", 422);
  if (!["NATIONAL_ID", "PASSPORT", "DRIVING_LICENSE"].includes(idType)) throw videoError("VALIDATION_ERROR", "Choose a valid document type.", 422);
  return { legalName: legalName.trim(), idType };
}
export async function submitKyc(db, userId, fields, images) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } }), { talent, where } = await kycIdentity(tx, user);
    if (!talent && user.role !== "HOST" && !user.appRoles?.includes("HOST")) throw videoError("KYC_HOST_REQUIRED", "Only hosts may submit verification.");
    if (user.isVerified) throw videoError("KYC_ALREADY_VERIFIED", "Your account is already verified.", 409);
    if (await tx.talentVerification.findFirst({ where: { ...where, status: "PENDING" } })) throw videoError("KYC_PENDING", "Your verification is already under review.", 409);
    if (await tx.talentVerification.count({ where: { ...where, submittedAt: { gt: new Date(Date.now() - 86400000) } } }) >= 3) throw videoError("KYC_RATE_LIMITED", "You can submit verification up to three times per day.", 429);
    const paths = {};
    for (const [field, data] of Object.entries(images)) { const image = await tx.kycImage.create({ data: { data } }); paths[field] = `kyc:${image.id}`; }
    const row = await tx.talentVerification.create({ data: { userId, talentId: talent?.id || null, ...paths, supportingFiles: fields, status: "PENDING" } });
    return kycDto(user, row);
  }, { timeout: 30000 });
}
export async function reviewKyc(db, admin, id, action, rejectionReason) {
  if (!["APPROVE", "REJECT"].includes(action)) throw videoError("VALIDATION_ERROR", "Choose APPROVE or REJECT.", 422);
  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (action === "REJECT" && (!reason || reason.length > 1000)) throw videoError("VALIDATION_ERROR", "Provide a rejection reason of up to 1000 characters.", 422);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "TalentVerification" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.talentVerification.findUnique({ where: { id }, include: { talent: true } });
    if (!before) throw videoError("KYC_NOT_FOUND", "Submission not found.", 404);
    if (before.status !== "PENDING") throw videoError("KYC_ALREADY_REVIEWED", "This submission has already been reviewed.", 409);
    const user = before.userId ? await tx.user.findUnique({ where: { id: before.userId } }) : before.talent ? await tx.user.findUnique({ where: { publicId: before.talent.publicId } }) : null;
    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
    const row = await tx.talentVerification.update({ where: { id }, data: { status, reviewedById: admin.id, reviewedAt: new Date(), rejectionReason: status === "REJECTED" ? reason : null } });
    if (before.talentId) await tx.talent.update({ where: { id: before.talentId }, data: { verification: status } });
    if (user && status === "APPROVED") await tx.user.update({ where: { id: user.id }, data: { isVerified: true } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: `KYC_${status}`, category: "USER_MANAGEMENT", entityType: "TalentVerification", entityId: id, description: "Reviewed host verification.", metadata: { before: { status: before.status }, after: { status, rejectionReason: row.rejectionReason, userId: user?.publicId || null } } } });
    if (user) await notifyAction(tx, { userId: user.id, key: `kyc-review:${id}`, type: "KYC_REVIEWED", title: "Host verification", body: status === "APPROVED" ? "Your host verification has been approved." : `Your host verification was declined: ${reason}`, action: { screen: "HOST_VERIFICATION", status, rejectionReason: row.rejectionReason } });
    return { publicId: user?.publicId, status, rejectionReason: row.rejectionReason };
  });
}
