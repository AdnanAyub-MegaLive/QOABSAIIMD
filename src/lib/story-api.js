import { prisma } from "./prisma.js";
import {
  requireMobileUser,
  mobileJson,
  mobileApiError,
  mobileOptions,
} from "./mobile-api.js";
import { requestOrigin } from "./user-perks.js";
import { visibleStory, storyError } from "./stories.js";
export { prisma, mobileJson, mobileOptions, requestOrigin };
export function storyRoute(fn) {
  return async (request, context = {}) => {
    try {
      const user = await requireMobileUser(request),
        params = (await context.params) ?? {};
      return await fn({
        request,
        user,
        params,
        origin: requestOrigin(request),
      });
    } catch (e) {
      if (e.status)
        return mobileJson(
          { success: false, error: { code: e.code, message: e.message } },
          e.status,
        );
      return mobileApiError(e, "STORY_FAILED");
    }
  };
}
export async function ownStory(id, user) {
  const row = await prisma.story.findFirst({
    where: { publicId: id, authorId: user.id },
  });
  if (!row) throw storyError("Story unavailable.", 404);
  return row;
}
export { visibleStory, storyError };
