import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { APK_MAX_BYTES, APK_MIME, apkDto, apkError, validateApk } from "@/lib/apk-uploads";

export const runtime = "nodejs";
const select = { publicId: true, name: true, fileSize: true, active: true, createdAt: true };
function failure(error) {
  if (!error.status) console.error("APK management failed", error);
  return Response.json({ success: false, error: { code: error.code || "APK_UPLOAD_FAILED", message: error.status ? error.message : "Unable to process APK." } }, { status: error.status || 500 });
}
function checkOrigin(request) {
  const origin = request.headers.get("origin");
  const configured = process.env.AUTH_URL || new URL(request.url).origin;
  if (!origin || origin !== new URL(configured).origin) throw apkError("Open this page from the portal's configured origin.", 403);
}
export async function GET() {
  try {
    await requirePermission("uploads.view");
    const rows = await prisma.uploadAsset.findMany({ where: { category: "APK", archivedAt: null }, select, orderBy: [{ createdAt: "desc" }, { publicId: "asc" }] });
    return Response.json({ success: true, data: { items: rows.map(apkDto) } });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const admin = await requirePermission("uploads.manage");
    checkOrigin(request);
    // Bound the entire multipart body before parsing it (including chunked requests).
    const reader = request.body?.getReader();
    if (!reader) throw apkError("Select an APK file.");
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > APK_MAX_BYTES + 1024 * 1024) { await reader.cancel(); throw apkError("APK files cannot exceed 250 MB.", 413); }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    const name = String(form.get("name") || "").trim();
    if (!name || name.length > 150) throw apkError("Provide a release name up to 150 characters.");
    const bytes = await validateApk(form.get("file"));
    const publicId = `APK-${randomUUID()}`;
    const asset = await prisma.$transaction(async tx => {
      const row = await tx.uploadAsset.create({ data: { publicId, name, category: "APK", fileName: `${publicId}.apk`, mimeType: APK_MIME, fileSize: bytes.length, fileData: bytes, distribution: "MANUAL", storeVisible: false, isGlobal: false }, select });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "APK_UPLOADED", category: "UPLOADS", entityId: publicId, entityType: "UploadAsset", description: `Uploaded APK: ${name}` } });
      return row;
    });
    return Response.json({ success: true, data: { item: apkDto(asset) } }, { status: 201 });
  } catch (error) { return failure(error); }
}
export async function PATCH(request) {
  try {
    const admin = await requirePermission("uploads.manage"); checkOrigin(request);
    const { id, active } = await request.json();
    if (typeof id !== "string" || typeof active !== "boolean") throw apkError("Provide the APK ID and availability.");
    await prisma.$transaction(async tx => {
      const result = await tx.uploadAsset.updateMany({ where: { publicId: id, category: "APK", archivedAt: null }, data: { active } });
      if (!result.count) throw apkError("APK not found.", 404);
      await tx.auditLog.create({ data: { adminId: admin.id, action: "APK_AVAILABILITY", category: "UPLOADS", entityId: id, entityType: "UploadAsset", description: active ? "Enabled APK download" : "Disabled APK download" } });
    });
    return Response.json({ success: true });
  } catch (error) { return failure(error); }
}
