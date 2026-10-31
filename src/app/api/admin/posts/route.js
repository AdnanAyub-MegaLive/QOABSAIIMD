import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { reviewPage } from "@/lib/review-pagination";
import { reviewPost } from "@/lib/post-review";
const json = data => Response.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
const fail = error => Response.json({ success: false, error: { code: error.status ? error.code : "POST_REVIEW_FAILED", message: error.status ? error.message : "Unable to review posts." } }, { status: error.status ?? 500 });
export async function GET(request) {
  try {
    await requirePermission("content.view");
    const params = new URL(request.url).searchParams;
    if (params.get("image")) {
      const post = await prisma.post.findUnique({ where: { publicId: params.get("image") }, select: { imageData: true, imageMime: true } });
      if (!post?.imageData) throw Object.assign(new Error("Image not found."), { status: 404, code: "IMAGE_NOT_FOUND" });
      return new Response(post.imageData, { headers: { "Content-Type": post.imageMime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const status = params.get("status") ?? "PENDING";
    if (!["PENDING", "APPROVED", "REJECTED", "ALL"].includes(status)) throw Object.assign(new Error("Invalid status."), { status: 422, code: "VALIDATION_ERROR" });
    const page = reviewPage(params, `posts:${status}`, "createdAt", status === "PENDING" ? "asc" : "desc");
    const rows = await prisma.post.findMany({ where: { AND: [status === "ALL" ? {} : { status }, page.after] }, select: { id: true, publicId: true, description: true, imageUrl: true, status: true, reviewReason: true, reviewRevision: true, createdAt: true, author: { select: { publicId: true, name: true } } }, orderBy: page.orderBy, take: page.take });
    return json(page.result(rows));
  } catch (error) { return fail(error); }
}
export async function PATCH(request) {
  try {
    const admin = await requirePermission("content.manage");
    return json(await reviewPost(prisma, admin.id, await request.json()));
  } catch (error) { return fail(error); }
}
