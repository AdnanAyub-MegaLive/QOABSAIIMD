import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { isRateLimited } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/user-perks";
import { readAvatarFile } from "@/lib/avatar-upload";
import { COVER_MAX_BYTES, decodeProfileCover, profileCoverDto } from "@/lib/profile-cover";
const path = "/api/v1/users/me/cover", methods = "POST, DELETE, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
async function change(request, remove) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const user = await requireMobileUser(request);
      if (isRateLimited(`profile-cover:${user.id}`, { limit: 10, windowMs: 3600000 })) {
        const response = mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "You can change your cover up to 10 times per hour." } }, 429);
        response.headers.set("Retry-After", "3600"); return response;
      }
      const bytes = remove ? null : await decodeProfileCover(await readAvatarFile(request, COVER_MAX_BYTES));
      await prisma.$transaction(async tx => {
        if (remove) await tx.profileCover.deleteMany({ where: { userId: user.id } });
        else await tx.profileCover.upsert({ where: { userId: user.id }, create: { userId: user.id, imageData: bytes, revision: randomUUID() }, update: { imageData: bytes, status: "PENDING", revision: randomUUID() } });
        await tx.auditLog.create({ data: { action: remove ? "PROFILE_COVER_DELETED" : "PROFILE_COVER_UPLOADED", category: "USER_MANAGEMENT", entityType: "User", entityId: user.publicId, description: "User changed their own profile cover." } });
      });
      return mobileJson({ success: true, data: await profileCoverDto(prisma, user.id, user.id, requestOrigin(request)) }, remove ? 200 : 201);
    } catch (error) {
      if (error.code === "FILE_TOO_LARGE") return mobileJson({ success: false, error: { code: error.code, message: error.message } }, 413);
      return mobileApiError(error, "PROFILE_COVER_FAILED");
    }
  });
}
export function POST(request) { return change(request, false); }
export function DELETE(request) { return change(request, true); }
