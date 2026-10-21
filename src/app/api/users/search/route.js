import { prisma } from "../../../../lib/prisma";
import { searchUsers } from "../../../../lib/user-search";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../lib/mobile-api";
import {
  publicUserWithPerks,
  requestOrigin,
  resolveUserPerks,
} from "../../../../lib/user-perks";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();
    if (!query)
      return mobileJson({ success: true, data: { users: [] } });

    const users = await searchUsers(prisma, user.id, query);
    const perks = await resolveUserPerks(
      users,
      requestOrigin(request),
      ["FRAMES", "BADGES"],
    );

    return mobileJson({
      success: true,
      data: {
        users: users.map((result) => ({
          ...publicUserWithPerks(result, perks.get(result.publicId)),
          specialId: result.specialId,
        })),
      },
    });
  } catch (error) {
    console.error("User search failed", error);
    return mobileApiError(error, "USER_SEARCH_FAILED");
  }
}
