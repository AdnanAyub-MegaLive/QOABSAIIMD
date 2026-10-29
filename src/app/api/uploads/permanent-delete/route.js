import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { sealDatabasePreview, openDatabasePreview } from "@/lib/database-management";
import { previewUnusedUpload, deleteUnusedUpload } from "@/lib/unused-upload-deletion";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(request) {
  try {
    sameOrigin(request);
    const admin = await requirePermission("uploads.delete");
    if (admin.role !== "SUPER_ADMIN") throw Object.assign(new Error("Only Platform Admin can permanently delete uploads."), { status: 403, code: "FORBIDDEN" });
    if (isRateLimited(`unused-upload:${admin.id}`, { limit: 10, windowMs: 60000 })) throw Object.assign(new Error("Please wait before trying again."), { status: 429, code: "RATE_LIMITED" });
    const body = await jsonBody(request);
    if (body.action === "PREVIEW") {
      if (typeof body.assetId !== "string" || body.assetId.length > 200) throw Object.assign(new Error("Select an upload."), { status: 422, code: "VALIDATION_ERROR" });
      const { asset, plan, dependencies } = await prisma.$transaction(tx => previewUnusedUpload(tx, body.assetId), { isolationLevel: "RepeatableRead", timeout: 60000 });
      return Response.json({ success: true, data: { name: asset.name, dependencies, canDelete: !dependencies.length, externalMediaRetained: Boolean(asset.cdnUrl || asset.posterCdnUrl), confirmation: `DELETE ${asset.publicId}`, token: dependencies.length ? null : sealDatabasePreview({ purpose: "UNUSED_UPLOAD", assetId: asset.publicId, fingerprint: plan.fingerprint, adminId: admin.id, sessionVersion: admin.sessionVersion, expiresAt: Date.now() + 300000 }) } }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "DELETE") throw Object.assign(new Error("Unknown action."), { status: 422, code: "VALIDATION_ERROR" });
    const approved = openDatabasePreview(body.token, admin.id);
    if (approved.purpose !== "UNUSED_UPLOAD" || approved.sessionVersion !== admin.sessionVersion || body.confirmation !== `DELETE ${approved.assetId}`) throw Object.assign(new Error("Generate a fresh preview and type the exact confirmation."), { status: 409, code: "CONFIRMATION_REQUIRED" });
    return Response.json({ success: true, data: await deleteUnusedUpload(prisma, admin, approved) });
  } catch (error) {
    return Response.json({ success: false, error: { code: error.status ? error.code : "DELETE_FAILED", message: error.status ? error.message : "Deletion refused or failed. No partial deletion was committed." } }, { status: error.status || 409 });
  }
}
