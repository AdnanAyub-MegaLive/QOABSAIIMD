import { publicCdnUrl, canPublishMedia } from "@/lib/media-cdn-policy";
import { auth } from "../../../../../../auth";
import { prisma } from "../../../../../lib/prisma";
import mobileSession from "../../../../../lib/mobile-session.cjs";
import {
  verifyPublicDisplayAssetUrl,
  verifySignedAssetUrl,
} from "../../../../../lib/upload-assets";
import { sessionInvalidation, signedAssetSessionInvalidation, mobileSessionError } from "../../../../../lib/mobile-session-state";

const publicDisplayCategories = new Set([
  "AGENCY_ARTWORK",
  "GAME_ICONS",
  "AVATARS",
  "FRAMES",
  "BADGES",
  "USER_TAGS",
  "PROFILE_BG",
  "ROOM_FRAMES",
  "ROOM_BACKGROUNDS",
  "SEAT_STYLES",
  "ENTRANCES",
  "TAIL_LIGHTS",
  "RIDES",
  "GIFTS",
  "LIVE_GIFTS",
  "CHAT_BOXES",
  "BUSINESS_CARD",
  "VIP_STICKERS",
  "CAMPAIGN_WIDGETS",
  "MUSIC_TRACKS",
]);

export async function GET(request, { params }) {
  const { assetId } = await params;
  const now = new Date();
  const asset = await prisma.uploadAsset.findUnique({
    where: { publicId: assetId },
    select: {
      publicId: true,
      mediaVersion:true,
      posterMediaVersion:true,
      cdnUrl: true,
      posterCdnUrl: true,
      audioRoomId: true,
      fileName: true,
      mimeType: true,
      posterFileSize: true,
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
      const invalidation = signed ? signedAssetSessionInvalidation(user, signed) : sessionInvalidation(user, payload);
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

async function mediaResponse(asset, request) {
  const wantsPoster = new URL(request.url).searchParams.get("poster") === "1";
  const version=wantsPoster?asset.posterMediaVersion:asset.mediaVersion;
  const requested=new URL(request.url).searchParams.get("v");
  if(requested&&requested!==version)return Response.json({success:false,error:{code:"MEDIA_VERSION_CHANGED",message:"Refresh the asset URL."}},{status:409,headers:{"Cache-Control":"no-store"}});
  const cache= requested&&version&&canPublishMedia(asset)?"public, max-age=31536000, immutable":"private, no-cache";
  const headers={"Cache-Control":cache,"X-Content-Type-Options":"nosniff",...(version?{ETag:`"${version}"`}:{})};
  // This executes only AFTER session/signature validation. Private files never
  // get a shared immutable cache policy, even with a guessed version.
  if(version&&request.headers.get("if-none-match")?.split(",").some(tag=>["*",`"${version}"`,`W/"${version}"`].includes(tag.trim())))return new Response(null,{status:304,headers});
  const cdn = publicCdnUrl(asset, wantsPoster);
  if (cdn) return new Response(null, { status: 307, headers: { Location: cdn, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  const bytes = await prisma.uploadAsset.findUnique({ where: { publicId: asset.publicId }, select: { fileData: true, posterFileData: true, mediaVersion: true, posterMediaVersion: true } });
  if (!bytes) return new Response(null, { status: 404 });
  if ((wantsPoster ? bytes.posterMediaVersion : bytes.mediaVersion) !== version)
    return Response.json({success:false,error:{code:"MEDIA_VERSION_CHANGED",message:"Refresh the asset URL."}},{status:409,headers:{"Cache-Control":"no-store"}});
  asset = { ...asset, ...bytes };
  if (wantsPoster && asset.posterFileData) asset = { ...asset, fileData: asset.posterFileData, fileName: asset.posterFileName, mimeType: asset.posterMimeType };
  const total = asset.fileData.byteLength;
  const range = (asset.mimeType === "video/mp4" || asset.mimeType.startsWith("audio/"))
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
      ...headers,
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
