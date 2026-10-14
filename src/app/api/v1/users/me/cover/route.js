import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { isRateLimited } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/user-perks";
import { readAvatarFile } from "@/lib/avatar-upload";
import { decodeProfileCover, profileCoverDto } from "@/lib/profile-cover";
const path = "/api/v1/users/me/cover", methods = "POST, DELETE, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
async function change(request, remove) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const user = await requireMobileUser(request);
      if (isRateLimited(`profile-cover:${user.id}`, { limit: 10, windowMs: 3600000 })) {
        const response = await mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "You can change your cover up to 10 times per hour." } }, 429);
        response.headers.set("Retry-After", "3600"); return response;
      }
      const file = remove ? null : await readAvatarFile(request, 20 * 1024 * 1024, ["image", "video"]);
      const bytes = remove ? null : await decodeProfileCover(file);
      const mimeType = ["image/gif","video/mp4"].includes(file?.type) ? file.type : "image/webp";
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
        if (!remove && !(await tx.profileCover.count({where:{userId:user.id}})) && await tx.profileCoverItem.count({where:{userId:user.id}}) >= 5) throw Object.assign(new Error("You may upload up to five covers."),{code:"COVER_LIMIT_REACHED",status:409});
        if (remove) await tx.profileCover.deleteMany({ where: { userId: user.id } });
        else await tx.profileCover.upsert({ where: { userId: user.id }, create: { userId: user.id, imageData: bytes, mimeType, revision: randomUUID() }, update: { createdAt: new Date(), imageData: bytes, mimeType, status: "PENDING", revision: randomUUID() } });
        await tx.auditLog.create({ data: { action: remove ? "PROFILE_COVER_DELETED" : "PROFILE_COVER_UPLOADED", category: "USER_MANAGEMENT", entityType: "User", entityId: user.publicId, description: "User changed their own profile cover." } });
      });
      return mobileJson({ success: true, data: await profileCoverDto(prisma, user.id, user.id, requestOrigin(request)) }, remove ? 200 : 201);
    } catch (error) {
      if (error.code === "COVER_LIMIT_REACHED" || error.code === "VIDEO_VALIDATION_UNAVAILABLE") return mobileJson({success:false,error:{code:error.code,message:error.message}},error.status);
      if (error.code === "FILE_TOO_LARGE") return mobileJson({ success: false, error: { code: error.code, message: error.message } }, 413);
      return mobileApiError(error, "PROFILE_COVER_FAILED");
    }
  });
}
export function POST(request) { return change(request, false); }
export function DELETE(request) { return change(request, true); }
