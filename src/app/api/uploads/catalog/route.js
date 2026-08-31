import { prisma } from "../../../../lib/prisma";
import mobileSession from "../../../../lib/mobile-session.cjs";
import {
  createSignedAssetUrl,
  serializeUploadAsset,
  validUploadCategories,
} from "../../../../lib/upload-assets";
import { syncProgressionProps } from "../../../../lib/props-store";
import { assertMobileSession, mobileSessionError } from "../../../../lib/mobile-session-state";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });
export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    const payload = mobileSession.verifyMobileSessionToken(token);
    const user = await prisma.user.findUnique({
      where: { publicId: payload.userId },
      select: { id: true, deletedAt: true, status: true, sessionVersion: true, forcedLogoutAt: true },
    });
    assertMobileSession(user, payload);
    await syncProgressionProps(user.id);
    const url = new URL(request.url);
    const category = url.searchParams
      .get("category")
      ?.toUpperCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_");
    if (category && !validUploadCategories.has(category))
      return json(
        {
          success: false,
          error: {
            code: "INVALID_CATEGORY",
            message: "Upload category is invalid.",
          },
        },
        422,
      );
    const roomBackground = url.searchParams.get("roomBackground") === "true";
    const now = new Date();
    const active = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const assets = await prisma.uploadAsset.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(roomBackground ? { isRoomBackground: true } : {}),
        OR: [
          { isGlobal: true },
          { assignments: { some: { userId: user.id, ...active } } },
        ],
      },
      include: {
        assignments: {
          where: active,
          include: {
            user: {
              select: { publicId: true, name: true, profileImage: true },
            },
          },
          orderBy: { assignedAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
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
    const origin = (
      process.env.MOBILE_API_BASE_URL ||
      (host ? `${protocol}://${host}` : url.origin)
    ).replace(/\/$/, "");
    return json({
      success: true,
      data: {
        assets: assets.map((asset) =>
          serializeUploadAsset(
            asset,
            createSignedAssetUrl(
              origin,
              asset.publicId,
              payload.userId,
              payload.sessionVersion,
            ),
          ),
        ),
      },
    });
  } catch (error) {
    return json(mobileSessionError(error?.message), 401);
  }
}
