import { prisma } from "../../../../lib/prisma";
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

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { not: user.id },
        OR: [
          { publicId: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        publicId: true,
        name: true,
        profileImage: true,
        gender: true,
        dob: true,
        isVerified: true,
        isOfficial: true,
        appRoles: true,
      },
      orderBy: [{ name: "asc" }, { publicId: "asc" }],
      take: 20,
    });
    const perks = await resolveUserPerks(
      users,
      requestOrigin(request),
      ["FRAMES", "BADGES"],
    );

    return mobileJson({
      success: true,
      data: {
        users: users.map((result) =>
          publicUserWithPerks(result, perks.get(result.publicId)),
        ),
      },
    });
  } catch (error) {
    console.error("User search failed", error);
    return mobileApiError(error, "USER_SEARCH_FAILED");
  }
}
