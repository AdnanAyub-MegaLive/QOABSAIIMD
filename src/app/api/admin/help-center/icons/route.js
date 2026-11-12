import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin } from "@/lib/game-control/http";
import { readUploadForm } from "@/lib/upload-form";
import { isRateLimited } from "@/lib/rate-limit";
export async function POST(request) {
  try {
    const admin = await requirePermission("help_center.manage"); sameOrigin(request);
    if (isRateLimited(`help-icons:${admin.id}`, { limit: 20, windowMs: 60000 })) throw Object.assign(new Error("Please wait before uploading more icons."), { status: 429 });
    const form = await readUploadForm(request, 3 * 1024 * 1024), file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) throw Object.assign(new Error("Choose an image up to 2 MB."), { status: 422 });
    let data;
    try {
      const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16000000 });
      if (!["jpeg", "png", "webp", "gif"].includes((await image.metadata()).format)) throw Error();
      data = await image.resize(512, 512, { fit: "inside", withoutEnlargement: true }).webp().toBuffer();
    } catch { throw Object.assign(new Error("Choose a valid PNG, JPEG, WebP or GIF icon."), { status: 422 }); }
    const icon = await prisma.$transaction(async tx => {
      const icon = await tx.helpIcon.create({ data: { data } });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "HELP_ICON_UPLOADED", category: "CONTENT_MANAGEMENT", entityType: "HelpIcon", entityId: icon.id, description: "Uploaded Help Center icon.", metadata: { before: null, after: { id: icon.id, mimeType: icon.mimeType, bytes: data.length } } } });
      return icon;
    });
    return Response.json({ success: true, data: { url: `/api/help-center/icons/${icon.id}` } });
  } catch (error) { return Response.json({ success: false, error: { message: error.status ? error.message : "Unable to upload icon." } }, { status: error.status || 500 }); }
}
