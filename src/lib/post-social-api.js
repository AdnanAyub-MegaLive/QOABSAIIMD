import { prisma } from "./prisma";
import { mobileApiError, mobileJson, requireMobileUser } from "./mobile-api";
import { isRateLimited } from "./rate-limit";
import { addPostComment, deletePostComment, listPostComments, setPostLike } from "./post-social";

export async function postSocialRequest(request, params, action) {
  try {
    const user = await requireMobileUser(request);
    const { postId, commentId } = await params;
    let data;
    if (action === "like" || action === "unlike") data = await setPostLike(prisma, postId, user.id, action === "like");
    else if (action === "list") data = await listPostComments(prisma, postId, new URL(request.url).searchParams.get("cursor")?.trim());
    else if (action === "delete") data = await deletePostComment(prisma, postId, user.id, commentId);
    else {
      if (isRateLimited(`post-comment:${user.id}`, { limit: 10, windowMs: 60000 })) {
        const response = mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Please wait before posting more comments." } }, 429);
        response.headers.set("Retry-After", "60");
        return response;
      }
      let body;
      try { body = await request.json(); }
      catch { return mobileJson({ success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400); }
      data = await addPostComment(prisma, postId, user.id, body?.text);
    }
    return mobileJson({ success: true, data }, action === "create" ? 201 : 200);
  } catch (error) {
    if (error.status) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
    return mobileApiError(error, "POST_INTERACTION_FAILED");
  }
}
