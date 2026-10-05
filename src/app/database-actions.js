"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "../lib/prisma";
import { generateTemporaryPassword, hashPassword } from "../lib/password";
import { emitToAudioRoom, emitToUser } from "../lib/realtime";
import {
  assignDefinitionToUser,
  autoAssignEligibleSpecialId,
  normalizeSpecialId,
  reconcileExpiredSpecialIds,
} from "../lib/special-id";
import { reconcileExpiredAudioRoomRestrictions } from "../lib/audio-room-maintenance";
import { syncProgressionProps } from "../lib/props-store";
import { syncResellerProps } from "../lib/reseller-props";
import { normalizeApplicationRoles, primaryLegacyRole } from "../lib/user-roles";
import {
  shouldAssignTalentPublicId,
  talentPublicIdForApprovedHost,
} from "../lib/host-public-id";
import { ledgerData } from "../lib/wallet";
import { generateNumericPublicId } from "../lib/public-id";



async function logActivity(admin, data) {
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: data.action,
      category: data.category,
      entityType: data.entityType,
      entityId: data.entityId,
      description: data.description,
      metadata: data.metadata,
    },
  });
  revalidatePath("/audit-logs");
}

const enumValue = (value) => {
  const normalized = String(value).trim().toUpperCase().replaceAll(" ", "_");
  if (normalized === "REVIEW") return "UNDER_REVIEW";
  if (normalized === "VIDEO_&_AUDIO_HOST") return "VIDEO_AND_AUDIO_HOST";
  return normalized;
};

const normalizePhone = (value) => {
  const phone = String(value ?? "")
    .trim()
    .replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(phone)) throw new Error("INVALID_PHONE");
  return phone;
};

const normalizeEmail = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase() || null;

export async function updateUserAccount(publicId, changes) {
  const admin = await requirePermission("users.edit");
  if (changes.status !== undefined) await requirePermission("users.ban");
  if (changes.isOfficial !== undefined || changes.isVerified !== undefined) await requirePermission("users.verify");
  if (changes.role !== undefined || changes.roles !== undefined) await requirePermission("hosts.manage");
  const currentUser = await prisma.user.findUniqueOrThrow({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      agencyId: true,
      role: true,
      appRoles: true,
      isVerified: true,
      status: true,
    },
  });
  const data = {};
  let nextRoles = normalizeApplicationRoles(currentUser.appRoles);
  if (changes.name !== undefined) data.name = changes.name;
  if (changes.email !== undefined) data.email = normalizeEmail(changes.email);
  if (changes.phone !== undefined) data.phone = normalizePhone(changes.phone);
  if (changes.country !== undefined) data.country = changes.country;
  if (changes.role !== undefined) {
    data.role = enumValue(changes.role);
    if (data.role === "HOST" && !currentUser.agencyId)
      throw new Error("HOST_AGENCY_REQUIRED");
  }
  if (changes.roles !== undefined) {
    const roles = normalizeApplicationRoles(changes.roles);
    if (roles.includes("HOST") && !currentUser.agencyId)
      throw new Error("HOST_AGENCY_REQUIRED");
    data.appRoles = { set: roles };
    nextRoles = roles;
    data.role = primaryLegacyRole(roles, currentUser.role);
    data.isOfficial = roles.includes("OFFICIAL");
  }
  if (changes.status !== undefined) data.status = enumValue(changes.status);
  if (changes.vipLevel !== undefined) data.vipLevel = Number(changes.vipLevel);
  if (changes.isOfficial !== undefined) {
    data.isOfficial = Boolean(changes.isOfficial);
    const roles = new Set(currentUser.appRoles);
    if (data.isOfficial) roles.add("OFFICIAL");
    else roles.delete("OFFICIAL");
    data.appRoles = { set: normalizeApplicationRoles([...roles]) };
    nextRoles = normalizeApplicationRoles([...roles]);
  }
  const nextStatus = data.status ?? currentUser.status;
  const isHost = Boolean(currentUser.agencyId) && (
    nextRoles.includes("HOST") ||
    (changes.roles === undefined && currentUser.role === "HOST")
  );
  const nextPublicId = shouldAssignTalentPublicId({
    hostEnabled: isHost,
    isVerified: currentUser.isVerified,
    status: nextStatus,
  })
    ? talentPublicIdForApprovedHost(currentUser.publicId)
    : currentUser.publicId;
  if (nextPublicId !== currentUser.publicId) {
    const conflict = await prisma.user.findUnique({
      where: { publicId: nextPublicId },
      select: { id: true },
    });
    if (conflict && conflict.id !== currentUser.id) {
      throw new Error("HOST_PUBLIC_ID_CONFLICT");
    }
    data.publicId = nextPublicId;
    data.sessionVersion = { increment: 1 };
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: currentUser.id }, data });
    if (data.appRoles) await syncResellerProps(currentUser.id, tx);
    if (nextPublicId !== currentUser.publicId) {
      await tx.legacyIdMapping.updateMany({
        where: { userId: currentUser.id, entityType: "USER", publicId: currentUser.publicId },
        data: { publicId: nextPublicId },
      });
      await tx.auditLog.updateMany({
        where: { entityType: "User", entityId: currentUser.publicId },
        data: { entityId: nextPublicId },
      });
    }
  });
  let action = "UPDATE_USER";
  let description = `${admin.name} updated user ${nextPublicId}`;
  if (changes.vipLevel !== undefined) {
    action = Number(changes.vipLevel) > 0 ? "GRANT_VIP" : "REMOVE_VIP";
    description =
      Number(changes.vipLevel) > 0
        ? `${admin.name} granted VIP ${changes.vipLevel} to user ${publicId}`
        : `${admin.name} removed VIP access from user ${publicId}`;
  } else if (changes.roles !== undefined) {
    action = "CHANGE_USER_ROLES";
    description = `${admin.name} changed the roles of user ${publicId} to ${normalizeApplicationRoles(changes.roles).join(", ")}`;
  } else if (changes.role !== undefined) {
    action = "CHANGE_USER_ROLE";
    description = `${admin.name} changed the role of user ${publicId} to ${changes.role}`;
  } else if (changes.status !== undefined) {
    action = "CHANGE_USER_STATUS";
    description = `${admin.name} changed user ${publicId} status to ${changes.status}`;
  } else if (changes.isOfficial !== undefined) {
    action = changes.isOfficial
      ? "USER_MARKED_OFFICIAL"
      : "USER_UNMARKED_OFFICIAL";
    description = `${admin.name} ${changes.isOfficial ? "marked" : "unmarked"} user ${publicId} as official`;
  } else if (
    changes.name !== undefined ||
    changes.email !== undefined ||
    changes.phone !== undefined ||
    changes.country !== undefined
  ) {
    action = "EDIT_USER_PROFILE";
    description = `${admin.name} edited profile details for user ${publicId}`;
  }
  await logActivity(admin, {
    action,
    category: "USER_MANAGEMENT",
    entityType: "User",
    entityId: nextPublicId,
    description,
    metadata: {
      ...changes,
      reason: changes.auditReason || null,
      previousPublicId: currentUser.publicId,
      publicId: nextPublicId,
    },
  });
  if (changes.vipLevel !== undefined) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { publicId: nextPublicId },
      select: { id: true },
    });
    await syncProgressionProps(user.id);
    const assignment = await autoAssignEligibleSpecialId(nextPublicId, "VIP");
    if (assignment)
      emitToUser(nextPublicId, "special-id:assigned", {
        success: true,
        data: {
          specialId: assignment.specialId,
          expiresAt: assignment.expiresAt.toISOString(),
          source: "VIP",
        },
      });
  }
  if (nextPublicId !== currentUser.publicId) {
    emitToUser(currentUser.publicId, "host:approved", {
      previousUserId: currentUser.publicId,
      userId: nextPublicId,
      sessionInvalidated: true,
    });
  }
  revalidatePath("/users");
  revalidatePath(`/users/${currentUser.publicId}`);
  revalidatePath(`/users/${nextPublicId}`);
}

export async function updateTalentAccount(publicId, changes) {
  const admin = await requirePermission("hosts.manage");
  if (changes.salary !== undefined) await requirePermission("hosts.salary");
  const talent = await prisma.talent.findUniqueOrThrow({ where: { publicId } });
  const data = {};
  if (changes.name !== undefined) data.displayName = changes.name;
  if (changes.email !== undefined) data.email = changes.email;
  if (changes.phone !== undefined) data.phone = changes.phone;
  if (changes.country !== undefined) data.country = changes.country;
  if (changes.status !== undefined) data.status = enumValue(changes.status);
  if (changes.verification !== undefined) {
    data.verification = enumValue(changes.verification);
    await prisma.talentVerification.create({
      data: {
        talentId: talent.id,
        reviewedById: admin.id,
        status: data.verification,
        reviewedAt: new Date(),
      },
    });
  }
  if (changes.salary !== undefined)
    await prisma.salaryHistory.create({
      data: {
        talentId: talent.id,
        adminId: admin.id,
        periodStart: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ),
        periodEnd: new Date(),
        amount: String(changes.salary),
        status: "PENDING",
        notes: "Salary adjusted from admin profile",
      },
    });
  if (Object.keys(data).length)
    await prisma.talent.update({ where: { publicId }, data });
  let action = "UPDATE_TALENT";
  let description = `${admin.name} updated host ${publicId}`;
  if (changes.verification !== undefined) {
    action = "CHANGE_TALENT_VERIFICATION";
    description = `${admin.name} changed host ${publicId} verification to ${changes.verification}`;
  } else if (changes.salary !== undefined) {
    action = "ADJUST_TALENT_SALARY";
    description = `${admin.name} adjusted host ${publicId} salary to ${changes.salary}`;
  } else if (changes.status !== undefined) {
    action = "CHANGE_TALENT_STATUS";
    description = `${admin.name} changed host ${publicId} status to ${changes.status}`;
  } else if (
    changes.name !== undefined ||
    changes.email !== undefined ||
    changes.phone !== undefined ||
    changes.country !== undefined
  ) {
    action = "EDIT_TALENT_PROFILE";
    description = `${admin.name} edited profile details for host ${publicId}`;
  }
  await logActivity(admin, {
    action,
    category: "TALENT_MANAGEMENT",
    entityType: "Talent",
    entityId: publicId,
    description,
    metadata: { ...changes, reason: changes.auditReason || null },
  });
  revalidatePath("/talents");
  revalidatePath(`/talents/${publicId}`);
}

export async function managePortalHost(publicId, changes) {
  const admin = await requirePermission("hosts.manage");
  const user = await prisma.user.findUniqueOrThrow({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      name: true,
      role: true,
      appRoles: true,
      agencyId: true,
      hostSalaryCoinBalance: true,
      sessionVersion: true,
    },
  });
  const hostEnabled = Boolean(changes.hostEnabled);
  const agencyPublicId = String(changes.agencyPublicId ?? "").trim();
  let agencyId = null;
  if (hostEnabled) {
    if (!agencyPublicId) throw new Error("HOST_AGENCY_REQUIRED");
    const agency = await prisma.agency.findFirst({
      where: { publicId: agencyPublicId, status: "ACTIVE" },
      select: { id: true, publicId: true, name: true },
    });
    if (!agency) throw new Error("HOST_AGENCY_REQUIRED");
    agencyId = agency.id;
  } else if (user.hostSalaryCoinBalance > 0n) {
    throw new Error("HOST_REMOVAL_REQUIRES_ZERO_SALARY");
  }

  const currentRoles = normalizeApplicationRoles(user.appRoles);
  const roles = normalizeApplicationRoles(
    hostEnabled
      ? [...currentRoles, "HOST"]
      : currentRoles.filter((role) => role !== "HOST"),
  );
  const status = enumValue(changes.status ?? "ACTIVE");
  if (!["ACTIVE", "PENDING", "SUSPENDED", "BANNED"].includes(status)) {
    throw new Error("INVALID_ACCOUNT_STATUS");
  }
  const isVerified = hostEnabled && Boolean(changes.isVerified);
  const auditReason = String(changes.auditReason ?? "").trim().slice(0, 1000);
  if (!auditReason) throw new Error("HOST_AUDIT_REASON_REQUIRED");
  const nextPublicId = shouldAssignTalentPublicId({ hostEnabled, isVerified, status })
    ? talentPublicIdForApprovedHost(user.publicId)
    : user.publicId;
  if (nextPublicId !== user.publicId) {
    const existingUser = await prisma.user.findUnique({
      where: { publicId: nextPublicId },
      select: { id: true },
    });
    if (existingUser && existingUser.id !== user.id) {
      throw new Error("HOST_PUBLIC_ID_CONFLICT");
    }
  }
  await prisma.$transaction(async (tx) => {
    if (!hostEnabled) {
      const openWithdrawals = await tx.walletWithdrawal.count({
        where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] } },
      });
      if (openWithdrawals) throw new Error("HOST_REMOVAL_HAS_OPEN_WITHDRAWALS");
    }
    await tx.user.update({
      where: { id: user.id },
      data: {
        publicId: nextPublicId,
        agencyId,
        appRoles: { set: roles },
        role: primaryLegacyRole(roles, user.role),
        isVerified,
        status,
        ...(nextPublicId !== user.publicId
          ? { sessionVersion: { increment: 1 } }
          : {}),
      },
    });
    if (nextPublicId !== user.publicId) {
      await tx.legacyIdMapping.updateMany({
        where: { userId: user.id, entityType: "USER", publicId: user.publicId },
        data: { publicId: nextPublicId },
      });
      await tx.auditLog.updateMany({
        where: { entityType: "User", entityId: user.publicId },
        data: { entityId: nextPublicId },
      });
    }
    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: hostEnabled ? "PORTAL_HOST_CONFIGURED" : "PORTAL_HOST_REMOVED",
        category: "TALENT_MANAGEMENT",
        entityType: "User",
        entityId: nextPublicId,
        description: hostEnabled
          ? `${admin.name} configured ${nextPublicId} as a portal host.`
          : `${admin.name} removed portal host access from ${user.publicId}.`,
        metadata: {
          source: "ADMIN_PORTAL",
          hostEnabled,
          agencyPublicId: agencyPublicId || null,
          status,
          isVerified,
          reason: auditReason,
          previousPublicId: user.publicId,
          publicId: nextPublicId,
          preservedSalaryCoinBalance: user.hostSalaryCoinBalance.toString(),
        },
      },
    });
  });
  revalidatePath("/talents");
  revalidatePath("/users");
  revalidatePath(`/users/${user.publicId}`);
  revalidatePath(`/users/${nextPublicId}`);
  revalidatePath("/agencies");
  if (nextPublicId !== user.publicId) {
    emitToUser(user.publicId, "host:approved", {
      previousUserId: user.publicId,
      userId: nextPublicId,
      sessionInvalidated: true,
    });
  }
  return { publicId: nextPublicId, previousPublicId: user.publicId, hostEnabled, agencyPublicId: agencyPublicId || null, status, isVerified };
}

export async function adjustUserCoins(publicId, operation, amount, reason) {
  const admin = await requirePermission("finance.adjust");
  if (!["add", "remove"].includes(operation) || !/^\d+$/.test(String(amount))) throw new Error("INVALID_COIN_ADJUSTMENT");
  const value = BigInt(amount);
  if (value <= 0n) throw new Error("INVALID_COIN_ADJUSTMENT");
  const { user, after } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { publicId } });
    const after =
      operation === "add"
        ? user.coinBalance + value
        : user.coinBalance > value
          ? user.coinBalance - value
          : 0n;
    await tx.user.update({
      where: { id: user.id },
      data: {
        coinBalance: after,
        ...(operation === "add" ? { totalTopUp: { increment: value } } : {}),
      },
    });
    await tx.coinAdjustment.create({
      data: {
        userId: user.id,
        adminId: admin.id,
        operation: operation === "add" ? "ADD" : "REMOVE",
        amount: value,
        balanceBefore: user.coinBalance,
        balanceAfter: after,
        reason,
      },
    });
    await tx.walletTransaction.create({
      data: ledgerData({
        userId: user.id,
        type: "ADMIN_ADJUSTMENT",
        direction: operation === "add" ? "CREDIT" : "DEBIT",
        title: operation === "add" ? "Coins added by administrator" : "Coins removed by administrator",
        description: reason,
        coins: operation === "add" ? value : user.coinBalance - after,
        referenceId: `COIN-ADJUSTMENT:${user.publicId}:${Date.now()}`,
        metadata: { adminId: admin.id, operation },
      }),
    });
    return { user, after };
  }, { isolationLevel: "Serializable" });
  await logActivity(admin, {
    action: operation === "add" ? "ADD_COINS" : "REMOVE_COINS",
    category: "FINANCE",
    entityType: "User",
    entityId: publicId,
    description: `${admin.name} ${operation === "add" ? "added" : "removed"} ${amount} coins ${operation === "add" ? "to" : "from"} user ${publicId}`,
    metadata: { amount, operation, reason, balanceAfter: Number(after) },
  });
  if (operation === "add") {
    await syncProgressionProps(user.id);
    const assignment = await autoAssignEligibleSpecialId(publicId, "TOP_UP");
    if (assignment)
      emitToUser(publicId, "special-id:assigned", {
        success: true,
        data: {
          specialId: assignment.specialId,
          expiresAt: assignment.expiresAt.toISOString(),
          source: "TOP_UP",
        },
      });
  }
  revalidatePath("/users");
  revalidatePath(`/users/${publicId}`);
  return Number(after);
}

export async function manageUserAssetGrant(
  publicId,
  assetPublicId,
  options = {},
) {
  const admin = await requirePermission("users.props");
  const [user, asset] = await Promise.all([
    prisma.user.findFirstOrThrow({
      where: { publicId, deletedAt: null },
      select: { id: true, publicId: true },
    }),
    prisma.uploadAsset.findFirstOrThrow({
      where: {
        publicId: assetPublicId,
        active: true,
        category: { notIn: ["BANNERS", "GIFTS"] },
      },
      select: { id: true, publicId: true, name: true, category: true },
    }),
  ]);
  const revoke = Boolean(options.revoke);
  const reason = String(options.reason ?? "").trim();
  if (!reason) throw new Error("REASON_REQUIRED");

  let result;
  if (revoke) {
    result = await prisma.$transaction(async (tx) => {
      const removed = await tx.uploadAssetAssignment.deleteMany({
        where: { assetId: asset.id, userId: user.id },
      });
      await tx.userEquippedProp.deleteMany({
        where: { assetId: asset.id, userId: user.id },
      });
      return { removed: removed.count };
    });
    emitToUser(publicId, "props:revoked", {
      assetId: asset.publicId,
      category: asset.category,
      reason,
    });
  } else {
    const permanent = Boolean(options.permanent);
    const durationMinutes = permanent
      ? null
      : Math.floor(Number(options.durationMinutes));
    if (!permanent && (!Number.isInteger(durationMinutes) || durationMinutes < 1))
      throw new Error("INVALID_DURATION");
    const assignedAt = new Date();
    const expiresAt = permanent
      ? null
      : new Date(assignedAt.getTime() + durationMinutes * 60_000);
    const entitlement = await prisma.uploadAssetAssignment.upsert({
      where: { assetId_userId: { assetId: asset.id, userId: user.id } },
      update: {
        assignedAt,
        durationMinutes,
        expiresAt,
        source: "ADMIN",
        sourceReference: null,
        purchasePrice: null,
      },
      create: {
        assetId: asset.id,
        userId: user.id,
        assignedAt,
        durationMinutes,
        expiresAt,
        source: "ADMIN",
      },
    });
    result = {
      assignedAt: entitlement.assignedAt.toISOString(),
      expiresAt: entitlement.expiresAt?.toISOString() ?? null,
      durationMinutes: entitlement.durationMinutes,
    };
    emitToUser(publicId, "props:granted", {
      assetId: asset.publicId,
      category: asset.category,
      source: "ADMIN",
      expiresAt: result.expiresAt,
    });
  }
  await logActivity(admin, {
    action: revoke ? "USER_PROP_REVOKED" : "USER_PROP_GRANTED",
    category: "CONTENT_MANAGEMENT",
    entityType: "User",
    entityId: publicId,
    description: `${admin.name} ${revoke ? "revoked" : "granted"} ${asset.name} ${revoke ? "from" : "to"} user ${publicId}`,
    metadata: {
      assetId: asset.publicId,
      category: asset.category,
      reason,
      ...result,
    },
  });
  revalidatePath("/uploads");
  revalidatePath(`/users/${publicId}`);
  return { assetId: asset.publicId, revoked: revoke, ...result };
}

export async function createAccount(type, values) {
  const admin = await requirePermission("users.create");
  if (type === "user") {
    const publicId = await generateNumericPublicId("USR", async (candidate) =>
      prisma.user.findUnique({ where: { publicId: candidate }, select: { id: true } }),
    );
    const phone = normalizePhone(values.phone);
    const email = normalizeEmail(values.email);
    if (await prisma.user.findUnique({ where: { phone } }))
      throw new Error("PHONE_ALREADY_EXISTS");
    if (email && (await prisma.user.findUnique({ where: { email } })))
      throw new Error("EMAIL_ALREADY_EXISTS");
    const passwordHash = await hashPassword(values.password);
    await prisma.user.create({
      data: {
        publicId,
        name: values.name,
        email,
        phone,
        passwordHash,
        country: values.country,
        status: enumValue(values.status),
        vipLevel: values.userType === "VIP User" ? 1 : 0,
      },
    });
    await logActivity(admin, {
      action: "CREATE_USER",
      category: "USER_MANAGEMENT",
      entityType: "User",
      entityId: publicId,
      description: `${admin.name} created user ${values.name} (${publicId})`,
      metadata: { phone, email, country: values.country },
    });
    revalidatePath("/users");
  } else {
    const agency = await prisma.agency.findFirst({
      where: { publicId: String(values.agencyId ?? ""), status: "ACTIVE" },
    });
    if (!agency) throw new Error("HOST_AGENCY_REQUIRED");
    const publicId = await generateNumericPublicId("TLN", async (candidate) =>
      prisma.talent.findUnique({ where: { publicId: candidate }, select: { id: true } }),
    );
    await prisma.talent.create({
      data: {
        publicId,
        displayName: values.displayName,
        legalName: values.name,
        email: values.email,
        phone: values.phone,
        country: values.country,
        type: enumValue(values.talentType),
        verification: enumValue(values.verificationStatus),
        status: "PENDING",
        agencyId: agency.id,
      },
    });
    await logActivity(admin, {
      action: "CREATE_TALENT",
      category: "TALENT_MANAGEMENT",
      entityType: "Talent",
      entityId: publicId,
      description: `${admin.name} created host ${values.displayName} (${publicId})`,
      metadata: { email: values.email, type: values.talentType, agencyId: agency.publicId },
    });
    revalidatePath("/talents");
  }
}

export async function createBan({
  publicId,
  target,
  reason,
  durationMinutes,
  permanent,
  proofImage,
  macAddress,
}) {
  const admin = await requirePermission(target === "DEVICE" ? "users.devices" : "users.ban");
  const isTalent = publicId.startsWith("T");
  const owner = isTalent
    ? await prisma.talent.findUniqueOrThrow({ where: { publicId } })
    : await prisma.user.findUniqueOrThrow({ where: { publicId } });
  let device;
  if (target === "DEVICE")
    device = await prisma.device.findFirstOrThrow({
      where: {
        ...(isTalent ? { talentId: owner.id } : { userId: owner.id }),
        ...(macAddress ? { macAddress } : {}),
      },
      orderBy: { lastLoginAt: "desc" },
    });
  const minutes = permanent ? null : Number(durationMinutes);
  await prisma.ban.create({
    data: {
      target,
      userId: !isTalent && target === "USER" ? owner.id : null,
      talentId: isTalent && target === "USER" ? owner.id : null,
      deviceId: device?.id,
      adminId: admin.id,
      reason,
      proofImage: proofImage || null,
      durationMinutes: minutes,
      expiresAt: minutes ? new Date(Date.now() + minutes * 60000) : null,
    },
  });
  if (target === "DEVICE")
    await prisma.device.update({
      where: { id: device.id },
      data: { isBanned: true },
    });
  else if (isTalent)
    await prisma.talent.update({
      where: { id: owner.id },
      data: { status: "BANNED" },
    });
  else
    await prisma.user.update({
      where: { id: owner.id },
      data: { status: "BANNED" },
    });
  await logActivity(admin, {
    action: target === "DEVICE" ? "BAN_DEVICE" : "BAN_ACCOUNT",
    category: "SECURITY",
    entityType: isTalent ? "Talent" : "User",
    entityId: publicId,
    description: `${admin.name} banned the ${target.toLowerCase()} for ${isTalent ? "host" : "user"} ${publicId}`,
    metadata: { reason, durationMinutes: minutes, permanent },
  });
  if (!isTalent && target === "USER") {
    const payload = {
      success: true,
      data: {
        sessionVersion: owner.sessionVersion,
        forcedLogoutAt: owner.forcedLogoutAt?.toISOString() ?? null,
        isBanned: true,
        banReason: reason,
        banExpiresAt: minutes
          ? new Date(Date.now() + minutes * 60000).toISOString()
          : null,
      },
    };
    emitToUser(publicId, "account:banned", payload);
    globalThis.portalScheduleBanExpiry?.(publicId, payload.data.banExpiresAt);
  }
  if (!isTalent && target === "DEVICE")
    emitToUser(publicId, "device:banned", {
      success: true,
      data: {
        macAddress: device.macAddress,
        reason,
        banExpiresAt: minutes
          ? new Date(Date.now() + minutes * 60000).toISOString()
          : null,
      },
    });
  revalidatePath(isTalent ? "/talents" : "/users");
}

export async function unbanUser(publicId, reason) {
  const admin = await requirePermission("users.ban");
  const isTalent = publicId.startsWith("T");
  const owner = isTalent
    ? await prisma.talent.findUniqueOrThrow({ where: { publicId } })
    : await prisma.user.findUniqueOrThrow({ where: { publicId } });
  const now = new Date();
  const revoked = await prisma.$transaction(async (tx) => {
    const result = await tx.ban.updateMany({
      where: {
        ...(isTalent ? { talentId: owner.id } : { userId: owner.id }),
        target: "USER",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { revokedAt: now },
    });
    if (isTalent)
      await tx.talent.update({
        where: { id: owner.id },
        data: { status: "ACTIVE" },
      });
    else
      await tx.user.update({
        where: { id: owner.id },
        data: { status: "ACTIVE" },
      });
    return result.count;
  });
  await logActivity(admin, {
    action: "UNBAN_ACCOUNT",
    category: "SECURITY",
    entityType: isTalent ? "Talent" : "User",
    entityId: publicId,
    description: `${admin.name} restored login access for ${isTalent ? "host" : "user"} ${publicId}`,
    metadata: { reason, revokedBans: revoked },
  });
  if (!isTalent)
    emitToUser(publicId, "account:unbanned", {
      success: true,
      data: {
        sessionVersion: owner.sessionVersion,
        forcedLogoutAt: owner.forcedLogoutAt?.toISOString() ?? null,
        isBanned: false,
        banReason: null,
        banExpiresAt: null,
      },
    });
  revalidatePath(isTalent ? "/talents" : "/users");
  revalidatePath(`/${isTalent ? "talents" : "users"}/${publicId}`);
}

export async function forceLogoutUser(publicId, reason) {
  const admin = await requirePermission("users.logout");
  const user = await prisma.user.update({
    where: { publicId },
    data: { sessionVersion: { increment: 1 }, forcedLogoutAt: new Date() },
    select: { id: true, sessionVersion: true, forcedLogoutAt: true },
  });
  const ban = await prisma.ban.findFirst({
    where: {
      userId: user.id,
      target: "USER",
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  await logActivity(admin, {
    action: "FORCE_LOGOUT",
    category: "SECURITY",
    entityType: "User",
    entityId: publicId,
    description: `${admin.name} forced user ${publicId} to log out of the application`,
    metadata: { reason, sessionVersion: user.sessionVersion },
  });
  emitToUser(publicId, "session:force-logout", {
    success: true,
    data: {
      sessionVersion: user.sessionVersion,
      forcedLogoutAt: user.forcedLogoutAt.toISOString(),
      isBanned: Boolean(ban),
      banReason: ban?.reason ?? null,
      banExpiresAt: ban?.expiresAt?.toISOString() ?? null,
      reason: reason || null,
    },
  });
  globalThis.portalDisconnectUser?.(publicId);
  revalidatePath("/users");
  revalidatePath(`/users/${publicId}`);
}

export async function unbanDevice(publicId, macAddress, reason) {
  const admin = await requirePermission("users.devices");
  const user = await prisma.user.findUniqueOrThrow({ where: { publicId } });
  const device = await prisma.device.findFirstOrThrow({
    where: { userId: user.id, macAddress },
  });
  const now = new Date();
  const revoked = await prisma.$transaction(async (tx) => {
    const result = await tx.ban.updateMany({
      where: {
        deviceId: device.id,
        target: "DEVICE",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { revokedAt: now },
    });
    await tx.device.update({
      where: { id: device.id },
      data: { isBanned: false },
    });
    return result.count;
  });
  await logActivity(admin, {
    action: "UNBAN_DEVICE",
    category: "SECURITY",
    entityType: "User",
    entityId: publicId,
    description: `${admin.name} unbanned device ${macAddress} for user ${publicId}`,
    metadata: { reason, macAddress, revokedBans: revoked },
  });
  emitToUser(publicId, "device:unbanned", {
    success: true,
    data: { macAddress, reason },
  });
  revalidatePath("/users");
  revalidatePath(`/users/${publicId}`);
}

export async function resetUserPassword(publicId, reason) {
  const admin = await requirePermission("users.password");
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await prisma.user.update({
    where: { publicId },
    data: {
      passwordHash,
      sessionVersion: { increment: 1 },
      forcedLogoutAt: new Date(),
    },
    select: { sessionVersion: true, forcedLogoutAt: true },
  });
  await logActivity(admin, {
    action: "RESET_USER_PASSWORD",
    category: "SECURITY",
    entityType: "User",
    entityId: publicId,
    description: `${admin.name} reset the password for user ${publicId}`,
    metadata: { reason },
  });
  emitToUser(publicId, "session:force-logout", {
    success: true,
    data: {
      sessionVersion: user.sessionVersion,
      forcedLogoutAt: user.forcedLogoutAt.toISOString(),
      isBanned: false,
      banReason: null,
      banExpiresAt: null,
      reason: "PASSWORD_RESET",
    },
  });
  globalThis.portalDisconnectUser?.(publicId);
  revalidatePath("/users");
  revalidatePath(`/users/${publicId}`);
  return { temporaryPassword };
}

export async function deleteUserAccount(publicId, reason) {
  const admin = await requirePermission("users.delete");
  const user = await prisma.user.findUniqueOrThrow({ where: { publicId } });
  const deletedAt = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: "Deleted User",
      email: null,
      phone: `deleted-${user.id}`,
      profileImage: null,
      passwordHash: null,
      status: "BANNED",
      deletedAt,
      forcedLogoutAt: deletedAt,
      sessionVersion: { increment: 1 },
    },
  });
  await logActivity(admin, {
    action: "DELETE_USER_ACCOUNT",
    category: "USER_MANAGEMENT",
    entityType: "User",
    entityId: publicId,
    description: `${admin.name} deleted user account ${publicId}`,
    metadata: { reason, deletedAt: deletedAt.toISOString() },
  });
  emitToUser(publicId, "session:force-logout", {
    success: true,
    data: { reason: "ACCOUNT_DELETED" },
  });
  globalThis.portalDisconnectUser?.(publicId);
  revalidatePath("/users");
  revalidatePath(`/users/${publicId}`);
}

export async function controlAudioRoom(
  roomId,
  action,
  reason,
  durationMinutes,
) {
  const admin = await requirePermission("rooms.manage");
  await reconcileExpiredAudioRoomRestrictions(roomId);
  const room = await prisma.audioRoom.findUniqueOrThrow({
    where: { roomId },
    include: { owner: true },
  });
  const now = new Date();
  const timed = ["DISABLE_JOINING", "BLOCK", "TERMINATE"].includes(action);
  const minutes = timed ? Number(durationMinutes) : null;
  if (timed && (!Number.isInteger(minutes) || minutes < 1))
    throw new Error("INVALID_AUDIO_ROOM_DURATION");
  const expiresAt = timed ? new Date(now.getTime() + minutes * 60000) : null;
  let event;
  let description;
  if (action === "BLOCK") {
    await prisma.audioRoom.update({
      where: { id: room.id },
      data: {
        isBlocked: true,
        blockedUntil: expiresAt,
        status: "BLOCKED",
        blockedReason: reason,
        terminatedUntil: null,
        endedAt: now,
      },
    });
    event = "audio-room:blocked";
    description = `${admin.name} blocked audio room ${roomId}`;
  } else if (action === "UNBLOCK") {
    await prisma.audioRoom.update({
      where: { id: room.id },
      data: {
        isBlocked: false,
        blockedUntil: null,
        blockedReason: null,
        status: "IDLE",
      },
    });
    event = "audio-room:unblocked";
    description = `${admin.name} unblocked audio room ${roomId}`;
  } else if (action === "DISABLE_JOINING") {
    await prisma.audioRoom.update({
      where: { id: room.id },
      data: { joiningDisabled: true, joiningDisabledUntil: expiresAt },
    });
    event = "audio-room:joining-disabled";
    description = `${admin.name} disabled joining for audio room ${roomId}`;
  } else if (action === "ENABLE_JOINING") {
    await prisma.audioRoom.update({
      where: { id: room.id },
      data: { joiningDisabled: false, joiningDisabledUntil: null },
    });
    event = "audio-room:joining-enabled";
    description = `${admin.name} enabled joining for audio room ${roomId}`;
  } else if (action === "TERMINATE") {
    await prisma.audioRoom.update({
      where: { id: room.id },
      data: {
        status: "TERMINATED",
        terminatedUntil: expiresAt,
        isBlocked: false,
        blockedUntil: null,
        blockedReason: null,
        endedAt: now,
      },
    });
    event = "audio-room:terminated";
    description = `${admin.name} terminated audio room ${roomId}`;
  } else if (action === "RESTORE") {
    await prisma.audioRoom.update({
      where: { id: room.id },
      data: { status: "IDLE", terminatedUntil: null },
    });
    event = "audio-room:restored";
    description = `${admin.name} restored audio room ${roomId}`;
  } else if (action === "DELETE") {
    throw new Error("AUDIO_ROOM_PERMANENT_DELETE_DISABLED");
  } else throw new Error("INVALID_AUDIO_ROOM_ACTION");
  if (timed)
    globalThis.portalScheduleAudioRoomRestriction?.(roomId, action, expiresAt);
  const payload = {
    success: true,
    data: {
      roomId,
      action,
      reason,
      durationMinutes: minutes,
      expiresAt: expiresAt?.toISOString() ?? null,
      actedAt: now.toISOString(),
    },
  };
  emitToAudioRoom(roomId, event, payload);
  emitToUser(room.owner.publicId, event, payload);
  await logActivity(admin, {
    action: `AUDIO_ROOM_${action}`,
    category: "USER_MANAGEMENT",
    entityType: "AudioRoom",
    entityId: roomId,
    description,
    metadata: {
      reason,
      ownerId: room.owner.publicId,
      durationMinutes: minutes,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });
  revalidatePath("/users");
  return payload.data;
}

export async function createSpecialIdDefinition(values) {
  const admin = await requirePermission("users.specialIds");
  const code = normalizeSpecialId(values.code);
  const category = String(values.category ?? "STANDARD").toUpperCase();
  if (!["STANDARD", "VIP", "SVIP"].includes(category))
    throw new Error("INVALID_SPECIAL_ID_CATEGORY");
  const duration = Number(values.defaultDurationMinutes);
  if (!Number.isInteger(duration) || duration < 1)
    throw new Error("INVALID_SPECIAL_ID_DURATION");
  const duplicate = await prisma.specialIdDefinition.findUnique({
    where: { code },
    select: { id: true },
  });
  if (duplicate)
    return {
      success: false,
      error: {
        code: "SPECIAL_ID_ALREADY_EXISTS",
        title: "Special ID Already Exists",
        message: `The Special ID ${code} is already in use. Please choose a different ID.`,
      },
    };
  let definition;
  try {
    definition = await prisma.specialIdDefinition.create({
      data: {
        code,
        category,
        minimumVipLevel: values.minimumVipLevel
          ? Number(values.minimumVipLevel)
          : null,
        minimumTopUpAmount: values.minimumTopUpAmount
          ? BigInt(values.minimumTopUpAmount)
          : null,
        defaultDurationMinutes: duration,
      },
    });
  } catch (error) {
    if (error?.code === "P2002")
      return {
        success: false,
        error: {
          code: "SPECIAL_ID_ALREADY_EXISTS",
          title: "Special ID Already Exists",
          message: `The Special ID ${code} is already in use. Please choose a different ID.`,
        },
      };
    throw error;
  }
  await logActivity(admin, {
    action: "CREATE_SPECIAL_ID",
    category: "USER_MANAGEMENT",
    entityType: "SpecialId",
    entityId: code,
    description: `${admin.name} created ${category} Special ID ${code}`,
    metadata: { ...values },
  });
  revalidatePath("/users");
  return {
    success: true,
    data: {
      ...definition,
      minimumTopUpAmount: Number(definition.minimumTopUpAmount ?? 0),
    },
  };
}

export async function deleteSpecialIdDefinition(
  definitionId,
  reason,
  revokeActive = false,
) {
  const admin = await requirePermission("users.specialIds");
  const note = String(reason ?? "").trim().slice(0, 500);
  if (!note) throw new Error("DELETION_REASON_REQUIRED");
  await reconcileExpiredSpecialIds();
  const definition = await prisma.specialIdDefinition.findUniqueOrThrow({
    where: { id: definitionId },
    include: {
      assignments: {
        where: { status: "ACTIVE", revokedAt: null, expiresAt: { gt: new Date() } },
        include: { user: { select: { publicId: true } } },
      },
      _count: { select: { assignments: true } },
    },
  });
  if (definition.assignments.length && !revokeActive)
    throw new Error("SPECIAL_ID_HAS_ACTIVE_ASSIGNMENT");
  const revokedAt = new Date();
  const mode = definition._count.assignments ? "ARCHIVED" : "DELETED";
  await prisma.$transaction(async (tx) => {
    if (definition.assignments.length)
      await tx.specialIdAssignment.updateMany({
        where: {
          definitionId: definition.id,
          status: "ACTIVE",
          revokedAt: null,
          expiresAt: { gt: revokedAt },
        },
        data: { status: "REVOKED", revokedAt },
      });
    if (definition._count.assignments) {
      await tx.specialIdDefinition.update({
        where: { id: definition.id },
        data: { active: false },
      });
    } else {
      await tx.specialIdDefinition.delete({ where: { id: definition.id } });
    }
    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: mode === "DELETED" ? "DELETE_SPECIAL_ID" : "ARCHIVE_SPECIAL_ID",
        category: "USER_MANAGEMENT",
        entityType: "SpecialIdDefinition",
        entityId: definition.code,
        description: `${admin.name} ${mode === "DELETED" ? "deleted" : "archived"} ${definition.category} Special ID ${definition.code}.`,
        metadata: {
          reason: note,
          mode,
          historicalAssignments: definition._count.assignments,
          revokedAssignments: definition.assignments.length,
        },
      },
    });
  });
  for (const assignment of definition.assignments)
    emitToUser(assignment.user.publicId, "special-id:revoked", {
      success: true,
      data: {
        normalId: assignment.user.publicId,
        effectiveId: assignment.user.publicId,
        specialId: null,
        reason: note,
      },
    });
  revalidatePath("/users");
  return { id: definition.id, code: definition.code, mode };
}

export async function assignSpecialId(
  publicId,
  definitionId,
  durationMinutes,
  reason,
) {
  const admin = await requirePermission("users.specialIds");
  const assignment = await assignDefinitionToUser({
    publicId,
    definitionId,
    durationMinutes,
    source: "ADMIN",
  });
  await logActivity(admin, {
    action: "ASSIGN_SPECIAL_ID",
    category: "USER_MANAGEMENT",
    entityType: "User",
    entityId: publicId,
    description: `${admin.name} assigned Special ID ${assignment.specialId} to user ${publicId}`,
    metadata: {
      reason,
      durationMinutes,
      expiresAt: assignment.expiresAt.toISOString(),
    },
  });
  emitToUser(publicId, "special-id:assigned", {
    success: true,
    data: {
      normalId: publicId,
      specialId: assignment.specialId,
      effectiveId: assignment.specialId,
      expiresAt: assignment.expiresAt.toISOString(),
      source: "ADMIN",
    },
  });
  revalidatePath("/users");
  revalidatePath(`/users/${publicId}`);
  return {
    id: assignment.id,
    specialId: assignment.specialId,
    expiresAt: assignment.expiresAt.toISOString(),
  };
}

export async function revokeSpecialId(assignmentId, reason) {
  const admin = await requirePermission("users.specialIds");
  await reconcileExpiredSpecialIds();
  const assignment = await prisma.specialIdAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { user: true },
  });
  await prisma.specialIdAssignment.update({
    where: { id: assignmentId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await logActivity(admin, {
    action: "REVOKE_SPECIAL_ID",
    category: "USER_MANAGEMENT",
    entityType: "User",
    entityId: assignment.user.publicId,
    description: `${admin.name} revoked Special ID ${assignment.specialId} from user ${assignment.user.publicId}`,
    metadata: { reason },
  });
  emitToUser(assignment.user.publicId, "special-id:revoked", {
    success: true,
    data: {
      normalId: assignment.user.publicId,
      effectiveId: assignment.user.publicId,
      specialId: null,
      reason,
    },
  });
  revalidatePath("/users");
}
