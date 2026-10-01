import { timingSafeEqual } from "node:crypto";
import { prisma } from "../../../../../lib/prisma.js";
import { entitlementExpiry } from "../../../../../lib/props-store.js";
import { emitToUser } from "../../../../../lib/realtime.js";

function authorized(request) {
  const expected = process.env.INTERNAL_REWARD_SECRET ?? "";
  const supplied = request.headers.get("x-internal-api-key") ?? "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return (
    expected &&
    supplied &&
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

export async function POST(request) {
  if (!process.env.INTERNAL_REWARD_SECRET)
    return Response.json(
      {
        success: false,
        error: {
          code: "INTERNAL_REWARD_NOT_CONFIGURED",
          message: "The trusted reward API is not configured.",
        },
      },
      { status: 503 },
    );
  if (!authorized(request))
    return Response.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid internal API key." },
      },
      { status: 401 },
    );
  try {
    const body = await request.json();
    const userPublicId = String(body?.userId ?? "").trim();
    const assetPublicId = String(body?.assetId ?? "").trim();
    const reference = String(body?.reference ?? "").trim().slice(0, 200) || null;
    const duration =
      body?.durationMinutes === null || body?.permanent === true
        ? null
        : body?.durationMinutes === undefined
          ? undefined
          : Number(body.durationMinutes);
    if (
      !userPublicId ||
      !assetPublicId ||
      (duration !== undefined &&
        duration !== null &&
        (!Number.isInteger(duration) || duration < 1 || duration > 5256000))
    )
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "userId, assetId, and a valid duration are required.",
          },
        },
        { status: 422 },
      );
    const [user, asset] = await Promise.all([
      prisma.user.findFirst({
        where: { publicId: userPublicId, deletedAt: null },
        select: { id: true, publicId: true },
      }),
      prisma.uploadAsset.findFirst({
        where: { publicId: assetPublicId, active: true, category: { not: "BANNERS" } },
      }),
    ]);
    if (!user || !asset)
      return Response.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "The user or reward asset was not found.",
          },
        },
        { status: 404 },
      );
    const durationMinutes =
      duration === undefined ? asset.defaultGrantDurationMinutes : duration;
    const expiresAt =
      durationMinutes === null
        ? null
        : entitlementExpiry(
            { defaultGrantDurationMinutes: durationMinutes },
            new Date(),
          );
    const entitlement = await prisma.uploadAssetAssignment.upsert({
      where: { assetId_userId: { assetId: asset.id, userId: user.id } },
      update: {
        assignedAt: new Date(),
        durationMinutes,
        expiresAt,
        source: "ACTIVITY",
        sourceReference: reference,
        purchasePrice: null,
      },
      create: {
        assetId: asset.id,
        userId: user.id,
        durationMinutes,
        expiresAt,
        source: "ACTIVITY",
        sourceReference: reference,
      },
    });
    emitToUser(user.publicId, "props:granted", {
      assetId: asset.publicId,
      category: asset.category,
      source: entitlement.source,
      expiresAt: entitlement.expiresAt?.toISOString() ?? null,
    });
    return Response.json({
      success: true,
      data: {
        assetId: asset.publicId,
        userId: user.publicId,
        source: entitlement.source,
        expiresAt: entitlement.expiresAt?.toISOString() ?? null,
        permanent: entitlement.expiresAt === null,
      },
    });
  } catch (error) {
    console.error("Internal prop grant failed", error);
    return Response.json(
      {
        success: false,
        error: {
          code: "PROP_GRANT_FAILED",
          message: "Unable to grant this reward.",
        },
      },
      { status: 500 },
    );
  }
}
