import {
  storyRoute,
  prisma,
  mobileOptions,
  visibleStory,
} from "@/lib/story-api";
import { storyMediaResponse } from "@/lib/stories";
export const OPTIONS = mobileOptions;
export const GET = storyRoute(async ({ user, params, request }) =>
  storyMediaResponse(await visibleStory(prisma, params.id, user.id), request),
);
