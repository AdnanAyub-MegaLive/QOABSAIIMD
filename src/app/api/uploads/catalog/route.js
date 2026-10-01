import { createHash } from "node:crypto";
import { prisma } from "../../../../lib/prisma";
import mobileSession from "../../../../lib/mobile-session.cjs";
import {
  createSignedAssetUrl,
  bannerCatalogOrderBy,
  bannerCatalogWhere,
  cleanBannerPlacement,
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
const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { ...corsHeaders, ...headers } });
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
    const suppliedPlacement = url.searchParams.get("placement");
    let placement = null;
    if (category === "BANNERS") {
      try {
        placement = cleanBannerPlacement(suppliedPlacement, { required: true });
      } catch (error) {
        return json(
          {
            success: false,
            error: { code: "VALIDATION_ERROR", message: error.message },
          },
          422,
        );
      }
    } else if (suppliedPlacement !== null) {
      return json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Placement is only supported when category is BANNERS.",
          },
        },
        422,
      );
    }
    const roomBackground = url.searchParams.get("roomBackground") === "true";
    const now = new Date();
    const active = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const assets = await prisma.uploadAsset.findMany({
      where: {
        ...(category ? { category } : { category: { not: "BANNERS" } }),
        ...(category === "BANNERS"
          ? bannerCatalogWhere(placement)
          : {}),
        ...(roomBackground ? { isRoomBackground: true } : {}),
        ...(["ROOM_BACKGROUNDS", "SEAT_STYLES"].includes(category)
          ? { mimeType: { in: category === "ROOM_BACKGROUNDS" ? ["image/png", "image/jpeg", "image/webp", "video/mp4"] : ["image/png", "image/jpeg", "image/webp"] } }
          : {}),
        ...(category === "BANNERS"
          ? {}
          : ["ROOM_BACKGROUNDS", "SEAT_STYLES"].includes(category)
            ? {
                OR: [
                  { isGlobal: true },
                  { assignments: { some: { userId: user.id } } },
                ],
              }
          : {
              OR: [
                { isGlobal: true },
                { assignments: { some: { userId: user.id, ...active } } },
              ],
            }),
      },
      include: {
        assignments: {
          where: {
            userId: user.id,
            ...(["ROOM_BACKGROUNDS", "SEAT_STYLES"].includes(category) ? {} : active),
          },
          include: {
            user: {
              select: { publicId: true, name: true, profileImage: true },
            },
          },
          orderBy: { assignedAt: "asc" },
        },
      },
      orderBy:
        category === "BANNERS"
          ? bannerCatalogOrderBy
          : { createdAt: "desc" },
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
    const etag = `"${createHash("sha256")
      .update(assets.map((asset) => `${asset.publicId}:${asset.updatedAt.toISOString()}`).join("|"))
      .digest("base64url")}"`;
    const cacheHeaders = {
      ETag: etag,
      "Cache-Control": "private, max-age=60, must-revalidate",
      ...(assets.length
        ? {
            "Last-Modified": new Date(
              Math.max(...assets.map((asset) => asset.updatedAt.getTime())),
            ).toUTCString(),
          }
        : {}),
    };
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ...corsHeaders, ...cacheHeaders },
      });
    }
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
              21600,
            ),
          ),
        ),
      },
    }, 200, cacheHeaders);
  } catch (error) {
    return json(mobileSessionError(error?.message), 401);
  }
}
