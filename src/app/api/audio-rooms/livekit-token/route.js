import { AccessToken } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";

export const runtime = "nodejs";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json().catch(() => ({}));
    const roomId = String(body?.roomId ?? "").trim();
    if (!roomId) {
      return mobileJson(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "roomId is required.",
          },
        },
        400,
      );
    }

    const livekitUrl = String(process.env.LIVEKIT_URL ?? "").trim();
    const apiKey = String(process.env.LIVEKIT_API_KEY ?? "").trim();
    const apiSecret = String(process.env.LIVEKIT_API_SECRET ?? "").trim();
    if (!livekitUrl || !apiKey || !apiSecret) {
      return mobileJson(
        {
          success: false,
          error: {
            code: "LIVEKIT_NOT_CONFIGURED",
            message: "Live audio is not configured on this server.",
          },
        },
        503,
      );
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(livekitUrl);
    } catch {
      parsedUrl = null;
    }
    if (!parsedUrl || !["ws:", "wss:"].includes(parsedUrl.protocol)) {
      console.error("LiveKit token issuance failed: LIVEKIT_URL must use ws:// or wss://");
      return mobileJson(
        {
          success: false,
          error: {
            code: "LIVEKIT_NOT_CONFIGURED",
            message: "Live audio is not configured on this server.",
          },
        },
        503,
      );
    }

    const room = await prisma.audioRoom.findUnique({
      where: { roomId },
      select: {
        ownerId: true,
        status: true,
        isBlocked: true,
        joiningDisabled: true,
      },
    });
    if (!room || room.status !== "LIVE" || room.isBlocked) {
      return mobileJson(
        { success: false, error: { code: "ROOM_UNAVAILABLE" } },
        404,
      );
    }

    const isOwner = room.ownerId === user.id;
    if (room.joiningDisabled && !isOwner) {
      return mobileJson(
        { success: false, error: { code: "ROOM_OWNER_ONLY" } },
        403,
      );
    }

    // Seat state is not persisted yet. Until it is, only the room owner may
    // publish audio; viewers receive subscribe-only tokens.
    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.publicId,
      name: user.name,
      ttl: "10m",
    });
    token.addGrant({
      room: roomId,
      roomJoin: true,
      canPublish: isOwner,
      canSubscribe: true,
      canPublishData: true,
    });

    return mobileJson({
      success: true,
      data: {
        token: await token.toJwt(),
        url: livekitUrl,
      },
    });
  } catch (error) {
    console.error("LiveKit token issuance failed", error);
    return mobileApiError(error, "LIVEKIT_TOKEN_FAILED");
  }
}
