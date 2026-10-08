import { portalPermissionError } from "@/lib/portal-admin";
import { auth } from "../../../../auth";
import { prisma } from "../../../lib/prisma";
import {
  cleanBannerActionUrl,
  cleanSortOrder,
  serializeUploadAsset,
  validateUploadAssetContract,
  validUploadCategories,
} from "../../../lib/upload-assets";

const allowedTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
]);
const maxFileSize = 15 * 1024 * 1024;
const maxMusicFileSize = 50 * 1024 * 1024;
const distributions = new Set(["FREE", "MANUAL", "STORE", "VIP", "SVIP", "ACTIVITY", "RESELLER"]);
const giftTiers = new Set(["CLASSIC", "PREMIUM", "VIP", "LUCKY", "BLIND_BOX"]);
const assignmentInclude = {
  assignments: {
    include: {
      user: { select: { publicId: true, name: true, profileImage: true } },
    },
    orderBy: { assignedAt: "asc" },
  },
};

function publicIds(value) {
  const values = Array.isArray(value) ? value : [];
  return [
    ...new Set(values.map((item) => String(item).trim()).filter(Boolean)),
  ].slice(0, 1000);
}

function cleanTags(value) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))]
    .slice(0, 20)
    .map((item) => item.slice(0, 40));
}

function optionalWholeNumber(value, field, { min = 0, max } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (
    !Number.isSafeInteger(number) ||
    number < min ||
    (max !== undefined && number > max)
  ) {
    const error = new Error(`${field} is invalid.`);
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return number;
}

function distributionFields(input, isBanner) {
  if (isBanner)
    return {
      distribution: "MARKETING",
      storeVisible: false,
      coinPrice: null,
      minimumVipLevel: null,
      minimumRecharge: null,
      defaultGrantDurationMinutes: null,
    };
  const distribution = String(input.distribution ?? "STORE").toUpperCase();
  if (!distributions.has(distribution)) {
    const error = new Error("Asset distribution method is invalid.");
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  const coinPrice = optionalWholeNumber(input.coinPrice, "Store price");
  const minimumVipLevel = optionalWholeNumber(
    input.minimumVipLevel,
    "Minimum VIP level",
    { min: 1, max: 5 },
  );
  const minimumRecharge = optionalWholeNumber(
    input.minimumRecharge,
    "Minimum recharge",
    { min: 1 },
  );
  if (distribution === "STORE" && coinPrice === null) {
    const error = new Error("A coin price is required for Store items.");
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  if (distribution === "VIP" && minimumVipLevel === null) {
    const error = new Error("A VIP level is required for VIP items.");
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  if (distribution === "SVIP" && minimumRecharge === null) {
    const error = new Error("A recharge requirement is required for SVIP items.");
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return {
    distribution,
    storeVisible:
      input.storeVisible === true || input.storeVisible === "true",
    coinPrice: distribution === "STORE" ? BigInt(coinPrice) : null,
    minimumVipLevel: distribution === "VIP" ? minimumVipLevel : null,
    minimumRecharge:
      distribution === "SVIP" ? BigInt(minimumRecharge) : null,
    defaultGrantDurationMinutes: optionalWholeNumber(
      input.defaultGrantDurationMinutes,
      "Default ownership duration",
      { min: 1, max: 5256000 },
    ),
  };
}

function cleanGiftTier(value, required = false) {
  const tier = String(value ?? "").trim().toUpperCase();
  if (!tier && !required) return null;
  if (!giftTiers.has(tier)) {
    const error = new Error("Gift tier must be Classic, Premium, VIP, Lucky, or Blind Box.");
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return tier;
}

async function resolveUsers(client, ids) {
  if (!ids.length) return [];
  const users = await client.user.findMany({
    where: { publicId: { in: ids }, deletedAt: null },
    select: { id: true, publicId: true },
  });
  if (users.length !== ids.length) {
    const error = new Error("One or more selected users no longer exist.");
    error.code = "USER_NOT_FOUND";
    throw error;
  }
  return users;
}

async function isSuperAdmin(session) {
  const admin = await prisma.admin.findUnique({
    where: { email: session.user.email },
    select: { role: true, active: true },
  });
  return Boolean(admin?.active && admin.role === "SUPER_ADMIN");
}

function parseGrants(
  value,
  fallbackIds = [],
  fallbackMinutes = 10080,
  fallbackPermanent = false,
) {
  const values = Array.isArray(value)
    ? value
    : fallbackIds.map((userId) => ({
        userId,
        durationMinutes: fallbackMinutes,
        permanent: fallbackPermanent,
      }));
  const unique = new Map();
  for (const item of values) {
    const userId = String(item?.userId ?? "").trim();
    const durationMinutes = Number(item?.durationMinutes);
    const suppliedExpiry = item?.expiresAt ? new Date(item.expiresAt) : null;
    if (!userId) continue;
    if (item?.permanent === true)
      unique.set(userId, {
        userId,
        durationMinutes: null,
        expiresAt: null,
      });
    else if (suppliedExpiry && !Number.isNaN(suppliedExpiry.getTime()))
      unique.set(userId, {
        userId,
        durationMinutes:
          Number.isInteger(durationMinutes) && durationMinutes > 0
            ? durationMinutes
            : null,
        expiresAt: suppliedExpiry,
      });
    else if (
      Number.isInteger(durationMinutes) &&
      durationMinutes > 0 &&
      durationMinutes <= 5256000
    )
      unique.set(userId, {
        userId,
        durationMinutes,
        expiresAt: new Date(Date.now() + durationMinutes * 60000),
      });
  }
  return [...unique.values()].slice(0, 1000);
}

export async function POST(request) {
  const permissionDenied = await portalPermissionError("uploads.manage");
  if (permissionDenied) return permissionDenied;

  const session = await auth();
  if (!session?.user)
    return Response.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Administrator authentication is required.",
        },
      },
      { status: 401 },
    );
  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const details =
      String(form.get("details") ?? "")
        .trim()
        .slice(0, 2000) || null;
    let tags = [];
    try {
      tags = cleanTags(JSON.parse(String(form.get("tags") ?? "[]")));
    } catch {
      tags = cleanTags(form.get("tags"));
    }
    const category = String(form.get("category") ?? "");
    const isBanner = category === "BANNERS";
    const isGift = category === "GIFTS";
    const isMusic = category === "MUSIC_TRACKS";
    const distribution = distributionFields(
      {
        distribution: isGift ? "STORE" : isMusic ? "FREE" : form.get("distribution"),
        storeVisible: isGift ? false : form.get("storeVisible"),
        coinPrice: form.get("coinPrice"),
        minimumVipLevel: form.get("minimumVipLevel"),
        minimumRecharge: form.get("minimumRecharge"),
        defaultGrantDurationMinutes:
          form.get("defaultGrantDurationMinutes") || null,
      },
      isBanner,
    );
    const giftTier = cleanGiftTier(form.get("giftTier"), isGift);
    const giftRewardMinBps = giftTier === "LUCKY" ? Math.max(0, Math.min(50000, Number(form.get("giftRewardMinBps")) || 0)) : null;
    const giftRewardMaxBps = giftTier === "LUCKY" ? Math.max(giftRewardMinBps, Math.min(50000, Number(form.get("giftRewardMaxBps")) || 20000)) : null;
    if (isGift && (!distribution.coinPrice || distribution.coinPrice <= 0n)) {
      const error = new Error("Gift unit price must be at least 1 coin.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    const actionUrl = cleanBannerActionUrl(form.get("actionUrl"));
    let selectedIds = [];
    try {
      selectedIds = publicIds(
        JSON.parse(String(form.get("assignedUserIds") ?? "[]")),
      );
    } catch {
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Assigned users must be a valid list.",
          },
        },
        { status: 422 },
      );
    }
    if (isBanner || isGift || isMusic) selectedIds = [];
    if (selectedIds.length && !(await isSuperAdmin(session)))
      return Response.json(
        {
          success: false,
          error: {
            code: "SUPER_ADMIN_REQUIRED",
            message: "Only a Super Admin can grant assets manually.",
          },
        },
        { status: 403 },
      );
    const assignmentMinutes = Number(
      form.get("assignmentDurationMinutes") ?? 10080,
    );
    const assignmentPermanent = form.get("assignmentPermanent") === "true";
    const grants = parseGrants(
      null,
      selectedIds,
      assignmentMinutes,
      assignmentPermanent,
    );
    if (selectedIds.length && grants.length !== selectedIds.length)
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "A valid assignment time period is required.",
          },
        },
        { status: 422 },
      );
    const isRoomBackground =
      !isBanner &&
      (form.get("isRoomBackground") === "true" ||
        category === "ROOM_BACKGROUNDS");
    const file = form.get("file");
    const posterFile = form.get("posterFile");
    if (!name || name.length > 80)
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Name must contain 1 to 80 characters.",
          },
        },
        { status: 422 },
      );
    if (!validUploadCategories.has(category))
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Upload category is invalid.",
          },
        },
        { status: 422 },
      );
    if (!(file instanceof File) || !file.size)
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "A media file is required.",
          },
        },
        { status: 422 },
      );
    if (!allowedTypes.has(file.type))
      return Response.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_MEDIA_TYPE",
            message:
              "Only supported image, video, and music audio files are allowed.",
          },
        },
        { status: 415 },
      );
    const assetContract = validateUploadAssetContract({
      category,
      placement: form.get("placement"),
      mimeType: file.type,
    });
    const sortOrder = cleanSortOrder(form.get("sortOrder"));
    const fileSizeLimit = category === "MUSIC_TRACKS" ? maxMusicFileSize : maxFileSize;
    if (file.size > fileSizeLimit)
      return Response.json(
        {
          success: false,
          error: {
            code: "FILE_TOO_LARGE",
            message: category === "MUSIC_TRACKS" ? "Music files cannot exceed 50 MB." : "Files cannot exceed 15 MB.",
          },
        },
        { status: 413 },
      );
    const hasPoster = posterFile instanceof File && posterFile.size > 0;
    if (hasPoster && !["image/png", "image/jpeg", "image/webp"].includes(posterFile.type))
      return Response.json({ success: false, error: { code: "UNSUPPORTED_POSTER_TYPE", message: "Poster images must be PNG, JPEG, or WebP." } }, { status: 415 });
    if (hasPoster && posterFile.size > 5 * 1024 * 1024)
      return Response.json({ success: false, error: { code: "POSTER_TOO_LARGE", message: "Poster images cannot exceed 5 MB." } }, { status: 413 });
    if (hasPoster && !["BUSINESS_CARD", "PROFILE_DRESS", "FRAMES", "BADGES", "MEDALS", "ROLE_ARTWORK", "AGENCY_ARTWORK"].includes(category))
      return Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Poster images are currently supported only for Business Cards." } }, { status: 422 });
    if (["BUSINESS_CARD", "PROFILE_DRESS"].includes(category) && file.type === "video/mp4" && !hasPoster)
      return Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Video Business Cards require a poster image." } }, { status: 422 });
    const users = await resolveUsers(prisma, selectedIds);
    const publicId = `AST-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const posterBytes = hasPoster ? Buffer.from(await posterFile.arrayBuffer()) : null;
    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.uploadAsset.create({
        data: {
          publicId,
          name,
          details,
          tags,
          category,
          fileName: file.name.slice(0, 255),
          mimeType: file.type,
          fileSize: file.size,
          fileData: bytes,
          posterFileName: hasPoster ? posterFile.name.slice(0, 255) : null,
          posterMimeType: hasPoster ? posterFile.type : null,
          posterFileSize: hasPoster ? posterFile.size : null,
          posterFileData: posterBytes,
          actionUrl,
          placement: assetContract.placement,
          sortOrder,
          giftTier,
          giftRewardMinBps,
          giftRewardMaxBps,
          ...(isGift ? giftXpInput({senderXp:form.get("senderXp"),receiverXp:form.get("receiverXp")}) : {}),
          isGlobal: isBanner || distribution.distribution === "FREE",
          isRoomBackground,
          ...distribution,
        },
      });
      if (users.length)
        await tx.uploadAssetAssignment.createMany({
          data: users.map((user) => {
            const grant = grants.find((item) => item.userId === user.publicId);
            return {
              assetId: created.id,
              userId: user.id,
              durationMinutes: grant.durationMinutes,
              expiresAt: grant.expiresAt,
              source: "ADMIN",
            };
          }),
        });
      await tx.auditLog.create({
        data: {
          action: "UPLOAD_ASSET_CREATED",
          category: "CONTENT_MANAGEMENT",
          entityType: "UploadAsset",
          entityId: publicId,
          description: `${session.user.name ?? "Administrator"} uploaded ${name} to ${category} and assigned it to ${users.length} user(s).`,
          metadata: {
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            assignedUserIds: selectedIds,
            assignmentPermanent,
            distribution: distribution.distribution,
            storeVisible: distribution.storeVisible,
            coinPrice: distribution.coinPrice?.toString() ?? null,
            giftTier,
            minimumVipLevel: distribution.minimumVipLevel,
            minimumRecharge:
              distribution.minimumRecharge?.toString() ?? null,
            actionUrl,
            placement: assetContract.placement,
            sortOrder,
            isRoomBackground,
          },
        },
      });
      return tx.uploadAsset.findUniqueOrThrow({
        where: { id: created.id },
        include: assignmentInclude,
      });
    });
    return Response.json(
      {
        success: true,
        data: {
          asset: serializeUploadAsset(
            asset,
            `/api/uploads/${asset.publicId}/file`,
          ),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error?.code === "VALIDATION_ERROR")
      return Response.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 422 },
      );
    if (error?.code === "USER_NOT_FOUND")
      return Response.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 404 },
      );
    console.error("Asset upload failed", error);
    return Response.json(
      {
        success: false,
        error: {
          code: "UPLOAD_FAILED",
          message: "Unable to store this upload right now.",
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  const permissionDenied = await portalPermissionError("uploads.manage");
  if (permissionDenied) return permissionDenied;

  const session = await auth();
  if (!session?.user)
    return Response.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Administrator authentication is required.",
        },
      },
      { status: 401 },
    );
  try {
    const body = await request.json();
    const assetId = String(body?.assetId ?? "");
    const updatesAssignments =
      Array.isArray(body?.assignmentGrants) ||
      Array.isArray(body?.assignedUserIds);
    const grants = Array.isArray(body?.assignmentGrants)
      ? parseGrants(body.assignmentGrants)
      : parseGrants(
          null,
          publicIds(body?.assignedUserIds),
          Number(body?.assignmentDurationMinutes ?? 10080),
        );
    const selectedIds = updatesAssignments
      ? grants.map((grant) => grant.userId)
      : [];
    if (updatesAssignments && !(await isSuperAdmin(session)))
      return Response.json(
        {
          success: false,
          error: {
            code: "SUPER_ADMIN_REQUIRED",
            message: "Only a Super Admin can change manual grants.",
          },
        },
        { status: 403 },
      );
    if (
      updatesAssignments &&
      Array.isArray(body?.assignedUserIds) &&
      selectedIds.length !== publicIds(body.assignedUserIds).length
    )
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "A valid assignment time period is required.",
          },
        },
        { status: 422 },
      );
    const users = updatesAssignments
      ? await resolveUsers(prisma, selectedIds)
      : [];
    const asset = await prisma.$transaction(async (tx) => {
      const current = await tx.uploadAsset.findUniqueOrThrow({
        where: { publicId: assetId },
        select: {
          id: true,
          name: true,
          category: true,
          giftTier: true,
          placement: true,
          sortOrder: true,
        },
      });
      const isBanner = current.category === "BANNERS";
      if (current.category === "LIVE_GIFTS") throw new Error("Live gifts can only be managed in Live Management.");
      const isGift = current.category === "GIFTS";
      const isMusic = current.category === "MUSIC_TRACKS";
      const changesDistribution =
        body?.distribution !== undefined ||
        body?.storeVisible !== undefined ||
        body?.coinPrice !== undefined ||
        body?.minimumVipLevel !== undefined ||
        body?.minimumRecharge !== undefined ||
        body?.defaultGrantDurationMinutes !== undefined;
      const distribution = changesDistribution
        ? distributionFields(
            isGift
              ? { ...body, distribution: "STORE", storeVisible: false }
              : isMusic
                ? { ...body, distribution: "FREE", storeVisible: false }
              : body,
            isBanner,
          )
        : null;
      const giftTier =
        body?.giftTier !== undefined
          ? cleanGiftTier(body.giftTier, isGift)
          : current.giftTier;
      if (isGift && distribution && (!distribution.coinPrice || distribution.coinPrice <= 0n)) {
        const error = new Error("Gift unit price must be at least 1 coin.");
        error.code = "VALIDATION_ERROR";
        throw error;
      }
      if ((isBanner || isMusic) && updatesAssignments) {
        const error = new Error(isMusic ? "Music catalogue tracks cannot be assigned to individual users." : "Banners cannot be assigned to users.");
        error.code = "VALIDATION_ERROR";
        throw error;
      }
      if (updatesAssignments) {
        await tx.uploadAssetAssignment.deleteMany({
          where: { assetId: current.id },
        });
        if (users.length)
          await tx.uploadAssetAssignment.createMany({
            data: users.map((user) => {
              const grant = grants.find(
                (item) => item.userId === user.publicId,
              );
              return {
                assetId: current.id,
                userId: user.id,
                durationMinutes: grant.durationMinutes,
                expiresAt: grant.expiresAt,
                source: "ADMIN",
              };
            }),
          });
      }
      const name =
        typeof body?.name === "string" ? body.name.trim() : undefined;
      if (name !== undefined && (!name || name.length > 80)) {
        const error = new Error("Name must contain 1 to 80 characters.");
        error.code = "VALIDATION_ERROR";
        throw error;
      }
      const actionUrl =
        body?.actionUrl !== undefined
          ? cleanBannerActionUrl(body.actionUrl)
          : undefined;
      const placement = body?.placement !== undefined
        ? validateUploadAssetContract({
            category: current.category,
            placement: body.placement,
          }).placement
        : current.placement;
      if (isBanner && !placement) {
        validateUploadAssetContract({ category: current.category, placement });
      }
      const sortOrder = body?.sortOrder !== undefined
        ? cleanSortOrder(body.sortOrder)
        : current.sortOrder;
      const placementChanged = placement !== current.placement;
      const orderChanged = sortOrder !== current.sortOrder;
      await tx.uploadAsset.update({
        where: { id: current.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(typeof body?.details === "string" || body?.details === null
            ? {
                details:
                  String(body.details ?? "")
                    .trim()
                    .slice(0, 2000) || null,
              }
            : {}),
          ...(Array.isArray(body?.tags) ? { tags: cleanTags(body.tags) } : {}),
          ...(actionUrl !== undefined ? { actionUrl } : {}),
          ...(isBanner ? { placement, sortOrder } : {}),
          ...(isGift ? { giftTier, ...giftXpInput(body) } : {}),
          ...(updatesAssignments ? { isGlobal: false } : {}),
          ...(typeof body?.isRoomBackground === "boolean"
            ? { isRoomBackground: body.isRoomBackground }
            : {}),
          ...(isBanner ? { isGlobal: true, isRoomBackground: false } : {}),
          ...(isMusic ? { isGlobal: true, isRoomBackground: false, distribution: "FREE", storeVisible: false } : {}),
          ...(distribution ?? {}),
          ...(distribution ? { isGlobal: distribution.distribution === "FREE" } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          action: placementChanged
            ? "UPLOAD_BANNER_PLACEMENT_CHANGED"
            : orderChanged
              ? "UPLOAD_BANNER_REORDERED"
              : "UPLOAD_ASSET_UPDATED",
          category: "CONTENT_MANAGEMENT",
          entityType: "UploadAsset",
          entityId: assetId,
          description: `${session.user.name ?? "Administrator"} updated ${name ?? current.name}${updatesAssignments ? ` and assigned it to ${users.length} user(s)` : ``}.`,
          metadata: {
            ...(updatesAssignments ? { assignedUserIds: selectedIds } : {}),
            actionUrl,
            ...(isBanner
              ? {
                  previousPlacement: current.placement,
                  placement,
                  previousSortOrder: current.sortOrder,
                  sortOrder,
                }
              : {}),
            isRoomBackground: body?.isRoomBackground,
            ...(distribution
              ? {
                  distribution: distribution.distribution,
                  storeVisible: distribution.storeVisible,
                  coinPrice: distribution.coinPrice?.toString() ?? null,
                  giftTier,
                  minimumVipLevel: distribution.minimumVipLevel,
                  minimumRecharge:
                    distribution.minimumRecharge?.toString() ?? null,
                }
              : {}),
          },
        },
      });
      return tx.uploadAsset.findUniqueOrThrow({
        where: { id: current.id },
        include: assignmentInclude,
      });
    });
    return Response.json({
      success: true,
      data: {
        asset: serializeUploadAsset(
          asset,
          `/api/uploads/${asset.publicId}/file`,
        ),
      },
    });
  } catch (error) {
    if (error?.code === "VALIDATION_ERROR")
      return Response.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 422 },
      );
    if (error?.code === "P2025")
      return Response.json(
        {
          success: false,
          error: { code: "ASSET_NOT_FOUND", message: "Upload not found." },
        },
        { status: 404 },
      );
    if (error?.code === "USER_NOT_FOUND")
      return Response.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 404 },
      );
    console.error("Asset assignment update failed", error);
    return Response.json(
      {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Unable to update this upload right now.",
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const permissionDenied = await portalPermissionError("uploads.delete");
  if (permissionDenied) return permissionDenied;

  const session = await auth();
  if (!session?.user)
    return Response.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Administrator authentication is required.",
        },
      },
      { status: 401 },
    );

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        success: false,
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const assetId = String(body?.assetId ?? "").trim();
  const reason = String(body?.reason ?? "").trim().slice(0, 500);
  if (!assetId || !reason)
    return Response.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Upload ID and deletion reason are required.",
        },
      },
      { status: 422 },
    );

  try {
    await prisma.$transaction(async (tx) => {
      const asset = await tx.uploadAsset.findUniqueOrThrow({
        where: { publicId: assetId },
        select: {
          id: true,
          name: true,
          category: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          _count: { select: { assignments: true } },
        },
      });
      if (asset.category === "LIVE_GIFTS") throw new Error("Live gifts can only be managed in Live Management.");
      await tx.auditLog.create({
        data: {
          action: "UPLOAD_ASSET_DELETED",
          category: "CONTENT_MANAGEMENT",
          entityType: "UploadAsset",
          entityId: assetId,
          description: `${session.user.name ?? "Administrator"} permanently deleted uploaded asset ${asset.name}.`,
          metadata: {
            reason,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            fileSize: asset.fileSize,
            uploadCategory: asset.category,
            removedAssignments: asset._count.assignments,
          },
        },
      });
      await tx.uploadAsset.delete({ where: { id: asset.id } });
    });
    return Response.json({ success: true, data: { assetId } });
  } catch (error) {
    if (error?.code === "P2025")
      return Response.json(
        {
          success: false,
          error: { code: "ASSET_NOT_FOUND", message: "Upload not found." },
        },
        { status: 404 },
      );
    console.error("Asset deletion failed", error);
    return Response.json(
      {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: "Unable to delete this upload right now.",
        },
      },
      { status: 500 },
    );
  }
}
import { giftXpInput } from "@/lib/gift-xp-input";
