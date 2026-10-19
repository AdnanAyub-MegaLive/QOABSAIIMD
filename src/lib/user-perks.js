import { prisma } from "./prisma.js";
import { publicProgression } from "./progression.js";
import { decorationMedia, namedDecoration, perkMediaFields } from "./decoration-media.js";
import { formatDateOnly } from "./date-only.js";

const perkFields = {
  FRAMES: "frameUrl",
  BADGES: "badgeUrl",
  CHAT_BOXES: "chatBoxUrl",
  ENTRANCES: "entranceUrl",
  TAIL_LIGHTS: "rideUrl",
  RIDES: "rideUrl",
  ROOM_BACKGROUNDS: "roomBackgroundUrl",
  BUSINESS_CARD: "businessCardUrl",
  PROFILE_DRESS: "homeDressUrl",
  USER_TAGS: "userTagUrl",
  PROFILE_BG: "profileBackgroundUrl",
};

export function requestOrigin(request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host");
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProtocol || url.protocol.replace(":", "");
  return (
    process.env.MOBILE_API_BASE_URL ||
    (host ? `${protocol}://${host}` : url.origin)
  ).replace(/\/$/, "");
}

export function socketOrigin(socket) {
  const forwardedHost = String(
    socket.handshake.headers["x-forwarded-host"] ?? "",
  )
    .split(",")[0]
    .trim();
  const host = forwardedHost || socket.handshake.headers.host;
  const forwardedProtocol = String(
    socket.handshake.headers["x-forwarded-proto"] ?? "",
  )
    .split(",")[0]
    .trim();
  const protocol = forwardedProtocol || "http";
  return (
    process.env.MOBILE_API_BASE_URL ||
    (host ? `${protocol}://${host}` : `http://127.0.0.1:${process.env.PORT || 3000}`)
  ).replace(/\/$/, "");
}

export async function resolveUserPerks(
  users,
  origin,
  categories = ["FRAMES", "BADGES", "ROOM_BACKGROUNDS"],
) {
  const uniqueUsers = [
    ...new Map(
      users
        .filter((user) => user?.id && user?.publicId)
        .map((user) => [user.id, user]),
    ).values(),
  ];
  const result = new Map(
    uniqueUsers.map((user) => [
      user.publicId,
      {
        frameUrl: null,
        badgeUrl: null,
        chatBoxUrl: null,
        entranceUrl: null,
        rideUrl: null,
        roomBackgroundUrl: null,
        businessCardUrl: null,
        businessCardPosterUrl: null,
        businessCardMimeType: null,
        ...Object.assign({}, ...categories.filter(c => perkFields[c]).map(c => namedDecoration(perkFields[c].replace(/Url$/, ""), null))),
      },
    ]),
  );
  if (!uniqueUsers.length) return result;
  const progression = await publicProgression(uniqueUsers, origin);
  for (const user of uniqueUsers) result.get(user.publicId).progression = progression.get(user.publicId);

  const now = new Date();
  const userIds = uniqueUsers.map((user) => user.id);
  const assets = await prisma.uploadAsset.findMany({
    where: {
      active: true,
      category: { in: categories },
      OR: [
        { isGlobal: true },
        {
          assignments: {
            some: {
              userId: { in: userIds },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          },
        },
      ],
    },
    select: {
      id: true,
      publicId: true,
      category: true,
      mimeType: true,
      posterMimeType: true,
      mediaVersion:true,
      posterMediaVersion:true,
      isGlobal: true,
      createdAt: true,
      assignments: {
        where: {
          userId: { in: userIds },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { userId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const equipped = await prisma.userEquippedProp.findMany({
    where: {
      userId: { in: userIds },
      category: { in: categories },
      asset: { active: true },
    },
    select: { userId: true, category: true, assetId: true },
  });
  for (const user of uniqueUsers) {
    const perks = result.get(user.publicId);
    for (const category of categories) {
      const selected = equipped.find(
        (item) => item.userId === user.id && item.category === category,
      );
      const selectedAsset = selected
        ? assets.find(
            (asset) =>
              asset.id === selected.assetId &&
              asset.category === category && (asset.isGlobal || asset.assignments.some(
                (assignment) => assignment.userId === user.id,
              )),
          )
        : null;
      // Global availability permits equipping an asset; it is not a default.
      // Match equippedProfileAssets: no valid selection means no decoration.
      const asset = selectedAsset;
      if (asset && perkFields[category]) Object.assign(perks, namedDecoration(perkFields[category].replace(/Url$/, ""), decorationMedia(asset, origin)));
    }
  }
  return result;
}

export function publicUserWithPerks(user, perks) {
  return {
    ...perkMediaFields(perks),
    ...perks?.progression,
    publicId: user.publicId,
    name: user.name,
    profileImage: user.profileImage,
    gender: user.gender ?? null,
    dob: formatDateOnly(user.dob),
    isVerified: Boolean(user.isVerified),
    isOfficial: Boolean(user.isOfficial),
    roles: user.appRoles ?? [],
    frameUrl: perks?.frameUrl ?? null,
    badgeUrl: perks?.badgeUrl ?? null,
    businessCardUrl: perks?.businessCardUrl ?? null,
    businessCardPosterUrl: perks?.businessCardPosterUrl ?? null,
    businessCardMimeType: perks?.businessCardMimeType ?? null,
  };
}
