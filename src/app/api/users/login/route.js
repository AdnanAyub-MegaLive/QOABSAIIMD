import { prisma } from "../../../../lib/prisma";
import { verifyPassword } from "../../../../lib/password";
import mobileSession from "../../../../lib/mobile-session.cjs";
import {
  getEffectiveUserId,
  reconcileExpiredSpecialIds,
} from "../../../../lib/special-id";
import { reconcileExpiredBans } from "../../../../lib/ban-maintenance";
import { formatDateOnly } from "../../../../lib/date-only";
import { bannedAccountLoginResponse } from "../../../../lib/mobile-login-response";

const allowedOrigin = process.env.MOBILE_APP_ORIGIN || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });
const clean = (value, max = 255) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON.",
        },
      },
      400,
    );
  }
  const phone = String(body?.phone ?? "")
    .trim()
    .replace(/[\s().-]/g, "");
  const password = String(body?.password ?? "");
  const device = body?.device;
  const deviceId = clean(device?.deviceId ?? device?.macAddress, 255);
  const location = clean(device?.location, 500);
  if (
    !device ||
    typeof device !== "object" ||
    Array.isArray(device) ||
    !deviceId ||
    !location
  )
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Login device information is required.",
          fields: {
            ...(!deviceId
              ? {
                  "device.deviceId":
                    "A stable Android installation identifier is required.",
                }
              : {}),
            ...(!location
              ? {
                  "device.location":
                    "The user's current login location is required.",
                }
              : {}),
          },
        },
      },
      422,
    );
  const user = await prisma.user.findUnique({ where: { phone } });
  if (
    !user ||
    user.deletedAt ||
    !(await verifyPassword(password, user.passwordHash))
  )
    return json(
      {
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Phone number or password is incorrect.",
        },
      },
      401,
    );
  await reconcileExpiredBans();
  const forwardedFor = request.headers.get("x-forwarded-for");
  const loginIp =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const loginAt = new Date();
  const ban = await prisma.ban.findFirst({
    where: {
      userId: user.id,
      target: "USER",
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  const storedDevice = await prisma.$transaction(async (tx) => {
    const record = await tx.device.upsert({
      where: { userId_macAddress: { userId: user.id, macAddress: deviceId } },
      update: {
        lastLoginIp: loginIp,
        location,
        platform: clean(device.platform, 100),
        deviceName: clean(device.deviceName, 255),
        lastLoginAt: loginAt,
      },
      create: {
        userId: user.id,
        macAddress: deviceId,
        lastLoginIp: loginIp,
        location,
        platform: clean(device.platform, 100),
        deviceName: clean(device.deviceName, 255),
        lastLoginAt: loginAt,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: loginAt },
    });
    const blocked = ban || record.isBanned;
    await tx.auditLog.create({
      data: {
        action: ban
          ? "BANNED_USER_LOGIN_ATTEMPT"
          : record.isBanned
            ? "BANNED_DEVICE_LOGIN_ATTEMPT"
            : "USER_LOGIN",
        category: "AUTHENTICATION",
        entityType: "User",
        entityId: user.publicId,
        description: `User ${user.publicId} ${ban ? "attempted to log in while banned" : record.isBanned ? `attempted to log in from banned device ${deviceId}` : "logged in through the mobile application"}`,
        ipAddress: loginIp,
        metadata: {
          source: "MOBILE_APP",
          deviceId,
          location,
          platform: clean(device.platform, 100),
          deviceName: clean(device.deviceName, 255),
          blocked: Boolean(blocked),
        },
      },
    });
    return record;
  });
  const login = {
    ipAddress: storedDevice.lastLoginIp,
    deviceId: storedDevice.macAddress,
    macAddress: storedDevice.macAddress,
    location: storedDevice.location,
    platform: storedDevice.platform,
    deviceName: storedDevice.deviceName,
    loggedInAt:
      storedDevice.lastLoginAt?.toISOString() ?? loginAt.toISOString(),
  };
  if (ban) return json(bannedAccountLoginResponse(ban), 403);
  if (storedDevice.isBanned) {
    const deviceBan = await prisma.ban.findFirst({
      where: {
        deviceId: storedDevice.id,
        target: "DEVICE",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
    });
    return json(
      {
        success: false,
        error: {
          code: "DEVICE_BANNED",
          message: "This device has been banned.",
          details: {
            macAddress: storedDevice.macAddress,
            reason: deviceBan?.reason ?? null,
            expiresAt: deviceBan?.expiresAt?.toISOString() ?? null,
          },
        },
      },
      403,
    );
  }
  await reconcileExpiredSpecialIds();
  const identity = await getEffectiveUserId(user.id, user.publicId);
  const data = {
    sessionVersion: user.sessionVersion,
    forcedLogoutAt: user.forcedLogoutAt?.toISOString() ?? null,
    isBanned: false,
    banReason: null,
    banExpiresAt: null,
  };
  const session = mobileSession.createMobileSession(user, { deviceId });
  return json({
    success: true,
    data: {
      ...data,
      ...session,
      user: {
        id: identity.effectiveId,
        normalId: identity.normalId,
        specialId: identity.specialId,
        specialIdExpiresAt: identity.specialIdExpiresAt?.toISOString() ?? null,
        name: user.name,
        phone: user.phone,
        email: user.email,
        country: user.country,
        bio: user.bio,
        profileImage: user.profileImage,
        gender: user.gender,
        dob: formatDateOnly(user.dob),
        isVerified: Boolean(user.isVerified),
        isOfficial: Boolean(user.isOfficial),
        role: user.role,
        roles: user.appRoles,
        status: user.status,
        vipLevel: user.vipLevel,
        createdAt: user.createdAt.toISOString(),
      },
      login,
    },
  });
}
