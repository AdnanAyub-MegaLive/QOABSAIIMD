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
  "SEAT_STYLES",
  "ENTRANCES",
  "TAIL_LIGHTS",
  "RIDES",
  "GIFTS",
  "CHAT_BOXES",
  "BUSINESS_CARD",
  "VIP_STICKERS",
  "CAMPAIGN_WIDGETS",
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
      posterFileData: true,
      posterFileName: true,
      posterMimeType: true,
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
      if (publicDisplay && asset.active)
        return mediaResponse(asset, request);
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

  return mediaResponse(asset, request);
}

function mediaResponse(asset, request) {
  const wantsPoster = new URL(request.url).searchParams.get("poster") === "1";
  if (wantsPoster && asset.posterFileData) asset = { ...asset, fileData: asset.posterFileData, fileName: asset.posterFileName, mimeType: asset.posterMimeType };
  const total = asset.fileData.byteLength;
  const range = asset.mimeType === "video/mp4"
    ? parseByteRange(request.headers.get("range"), total)
    : null;
  const body = range
    ? asset.fileData.subarray(range.start, range.end + 1)
    : asset.fileData;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${total}` } : {}),
      "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
    },
  });
}

function parseByteRange(value, total) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value ?? "").trim());
  if (!match || total < 1) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= total) return null;
  return { start, end: Math.min(end, total - 1) };
}
