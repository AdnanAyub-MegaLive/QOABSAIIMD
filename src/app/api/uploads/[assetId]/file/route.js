import { auth } from "../../../../../../auth";
import { prisma } from "../../../../../lib/prisma";
import mobileSession from "../../../../../lib/mobile-session.cjs";
import {
  verifyPublicDisplayAssetUrl,
  verifySignedAssetUrl,
} from "../../../../../lib/upload-assets";
import { sessionInvalidation, mobileSessionError } from "../../../../../lib/mobile-session-state";

const publicDisplayCategories = new Set([
  "FRAMES",
  "BADGES",
  "ROOM_BACKGROUNDS",
  "ENTRANCES",
  "TAIL_LIGHTS",
  "RIDES",
  "GIFTS",
]);

export async function GET(request, { params }) {
  const { assetId } = await params;
  const now = new Date();
  const asset = await prisma.uploadAsset.findUnique({
    where: { publicId: assetId },
    select: {
      fileData: true,
      fileName: true,
      mimeType: true,
      category: true,
      active: true,
      isGlobal: true,
      storeVisible: true,
      assignments: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { userId: true },
      },
    },
  });
  if (!asset)
    return Response.json(
      {
        success: false,
        error: { code: "ASSET_NOT_FOUND", message: "Upload not found." },
      },
      { status: 404 },
    );

  const session = await auth();
  if (!session?.user) {
    try {
      const url = new URL(request.url);
      const publicDisplay =
        publicDisplayCategories.has(asset.category) &&
        verifyPublicDisplayAssetUrl(assetId, {
          expiresAt: url.searchParams.get("displayExp"),
          signature: url.searchParams.get("displaySig"),
        });
      if (publicDisplay)
        return mediaResponse(asset);
      const signed = verifySignedAssetUrl(assetId, {
        userId: url.searchParams.get("uid"),
        sessionVersion: url.searchParams.get("sv"),
        expiresAt: url.searchParams.get("exp"),
        signature: url.searchParams.get("sig"),
      });
      const payload =
        signed ??
        mobileSession.verifyMobileSessionToken(
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
        );
      const user = await prisma.user.findUnique({
        where: { publicId: payload.userId },
        select: { id: true, deletedAt: true, status: true, sessionVersion: true, forcedLogoutAt: true },
      });
      const invalidation = sessionInvalidation(user, payload);
      if (
        invalidation ||
        !asset.active ||
        (!asset.isGlobal &&
          !asset.storeVisible &&
          !asset.assignments.some(
            (assignment) => assignment.userId === user.id,
          ))
      )
        throw new Error(invalidation ?? "FORBIDDEN");
    } catch (error) {
      const sessionError = ["INVALID_SESSION", "SESSION_REVOKED"].includes(error?.message)
        ? mobileSessionError(error.message)
        : null;
      return Response.json(
        sessionError ?? {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "A valid session is required to access this upload.",
          },
        },
        { status: 401 },
      );
    }
  }

  return mediaResponse(asset);
}

function mediaResponse(asset) {
  return new Response(asset.fileData, {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.fileData.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`,
      "Cache-Control": "private, max-age=3600",
      "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
    },
  });
}
