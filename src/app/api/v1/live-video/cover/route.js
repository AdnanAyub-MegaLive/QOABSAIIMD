import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { requestOrigin } from "@/lib/user-perks";
import { COVER_LIMIT, decodeLiveCover } from "@/lib/video-cover";
const path = "/api/v1/live-video/cover", methods = "POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export function POST(request) { return withV1Request(request, { path, methods, rateLimit: { limit: 10, windowMs: 60000 } }, async () => {
  try {
    const user = await requireMobileUser(request);
    if (Number(request.headers.get("content-length")) > COVER_LIMIT + 65536) return mobileJson({ success: false, error: { code: "FILE_TOO_LARGE", message: "Cover cannot exceed 5 MB." } }, 413);
    const form = await request.formData(); const cover = form.get("cover");
    if (!(cover instanceof File)) return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "A cover image is required." } }, 422);
    if (cover.size > COVER_LIMIT) return mobileJson({ success: false, error: { code: "FILE_TOO_LARGE", message: "Cover cannot exceed 5 MB." } }, 413);
    const data = await decodeLiveCover(Buffer.from(await cover.arrayBuffer()), cover.type);
    const id = randomUUID();
    await prisma.videoLiveCover.create({ data: { id, userId: user.id, data } });
    return mobileJson({ success: true, data: { coverUrl: `${requestOrigin(request)}/api/v1/live-video/cover/${id}` } }, 201);
  } catch (error) { return mobileApiError(error, "LIVE_COVER_UPLOAD_FAILED"); }
}); }
