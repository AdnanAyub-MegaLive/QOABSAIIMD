import { randomUUID } from "node:crypto";
import { decodeAvatar } from "./avatar-upload.js";
import { mediaVersion } from "./media-version.js";
import { createPublicDisplayAssetUrl } from "./upload-assets.js";

function fail(code, message, status) {
  throw Object.assign(new Error(message), { code, status });
}

export async function saveAgencyLogo(db, userId, agencyId, file, origin) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    fail("VALIDATION_ERROR", "Agency pictures must be JPEG, PNG or WebP.", 422);
  if (file.size > 5 * 1024 * 1024) fail("FILE_TOO_LARGE", "Agency pictures cannot exceed 5 MB.", 413);
  const owned = await db.agency.findMany({
    where: { ownerUserId: userId, ...(agencyId ? { publicId: agencyId } : {}) },
    select: { id: true }, take: 2,
  });
  if (!owned.length) fail(agencyId ? "AGENCY_NOT_FOUND" : "FORBIDDEN", "You do not own this agency.", agencyId ? 404 : 403);
  if (owned.length > 1) fail("AGENCY_SELECTION_REQUIRED", "Select the agency whose picture you want to change.", 409);
  const bytes = await decodeAvatar(file);
  const publicId = `AST-${randomUUID()}`;
  const version = mediaVersion(bytes);
  const logoUrl = createPublicDisplayAssetUrl(origin, { publicId, mediaVersion: version }, 30 * 24 * 3600);
  await db.$transaction(async tx => {
    const agency = await tx.agency.findFirst({ where: { id: owned[0].id, ownerUserId: userId }, select: { id: true } });
    if (!agency) fail("AGENCY_NOT_FOUND", "You do not own this agency.", 404);
    await tx.uploadAsset.create({ data: {
      publicId, name: "Agency logo", category: "AGENCY_ARTWORK", fileName: `${publicId}.webp`,
      mimeType: "image/webp", fileSize: bytes.length, fileData: bytes, mediaVersion: version,
      isGlobal: true, storeVisible: false,
    } });
    await tx.agency.update({ where: { id: agency.id }, data: { logoAssetPublicId: publicId } });
    await tx.auditLog.create({ data: {
      action: "AGENCY_LOGO_UPDATED", category: "AGENCY_MANAGEMENT", entityType: "Agency", entityId: agency.id,
      description: "Agency owner updated the agency logo.", metadata: { actorUserId: userId, assetId: publicId },
    } });
  }, { isolationLevel: "Serializable" });
  return { logoUrl };
}

export async function agencyLogoUrl(db, publicId, origin) {
  if (!publicId) return null;
  const asset = await db.uploadAsset.findFirst({ where: { publicId, active: true }, select: { publicId: true, mediaVersion: true } });
  if (!asset || !origin) return null;
  // Missing/malformed optional artwork must not hide the agency. Database
  // failures deliberately propagate: they are not evidence of an absent logo.
  try { return createPublicDisplayAssetUrl(origin, asset, 30 * 24 * 3600); }
  catch (error) {
    if (error.code !== "ERR_INVALID_URL") throw error;
    return null;
  }
}
