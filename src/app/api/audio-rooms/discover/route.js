import { prisma } from "../../../../lib/prisma";
import mobileSession from "../../../../lib/mobile-session.cjs";
import { reconcileExpiredAudioRoomRestrictions } from "../../../../lib/audio-room-maintenance";
import {
  requestOrigin,
  resolveUserPerks,
} from "../../../../lib/user-perks";
import { formatDateOnly } from "../../../../lib/date-only";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function authenticatedUser(request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const payload = mobileSession.verifyMobileSessionToken(token);

  if (!payload?.userId) throw new Error("INVALID_SESSION");

  const user = await prisma.user.findUnique({
    where: { publicId: payload.userId },
    select: {
      id: true,
      deletedAt: true,
      sessionVersion: true,
    },
  });

  if (
    !user ||
    user.deletedAt ||
    Number(payload.sessionVersion) !== user.sessionVersion
  ) {
    throw new Error("INVALID_SESSION");
  }

  return user;
}

export async function GET(request) {
  try {
    const user = await authenticatedUser(request);

    // Clear restrictions whose allotted time has passed before discovering rooms.
    await reconcileExpiredAudioRoomRestrictions();

    const rooms = await prisma.audioRoom.findMany({
      where: {
        ownerId: { not: user.id },
        status: "LIVE",
        isBlocked: false,
        joiningDisabled: false,
        owner: {
          deletedAt: null,
          status: "ACTIVE",
        },
      },
      select: {
        roomId: true,
        title: true,
        country: true,
        coverImageUrl: true,
        participantCount: true,
        startedAt: true,
        owner: {
          select: {
            id: true,
            publicId: true,
            name: true,
            profileImage: true,
            gender: true,
            dob: true,
            isVerified: true,
            isOfficial: true,
          },
        },
      },
      orderBy: [{ participantCount: "desc" }, { startedAt: "desc" }],
      take: 50,
    });
    const origin = requestOrigin(request);
    const perks = await resolveUserPerks(
      rooms.map((room) => room.owner),
      origin,
    );

    return json({
      success: true,
      data: {
        rooms: rooms.map((room) => ({
          roomId: room.roomId,
          title: room.title,
          country: room.country ?? null,
          coverImageUrl: room.coverImageUrl
            ? new URL(room.coverImageUrl, origin).toString()
            : null,
          participantCount: room.participantCount,
          startedAt: room.startedAt,
          roomBackgroundUrl:
            perks.get(room.owner.publicId)?.roomBackgroundUrl ?? null,
          owner: {
            id: room.owner.publicId,
            name: room.owner.name,
            profileImage: room.owner.profileImage,
            gender: room.owner.gender ?? null,
            dob: formatDateOnly(room.owner.dob),
            isVerified: Boolean(room.owner.isVerified),
            isOfficial: Boolean(room.owner.isOfficial),
            frameUrl: perks.get(room.owner.publicId)?.frameUrl ?? null,
            badgeUrl: perks.get(room.owner.publicId)?.badgeUrl ?? null,
          },
        })),
      },
    });
  } catch {
    return json(
      {
        success: false,
        error: {
          code: "INVALID_SESSION",
          message: "The mobile session is invalid or expired.",
        },
      },
      401,
    );
  }
}
