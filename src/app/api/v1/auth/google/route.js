import { prisma } from "@/lib/prisma";
import mobileSession from "@/lib/mobile-session.cjs";
import { generateNumericPublicId } from "@/lib/public-id";
import { getEffectiveUserId, reconcileExpiredSpecialIds } from "@/lib/special-id";
import { reconcileExpiredBans } from "@/lib/ban-maintenance";
import { resolveSignupCountry, requiresSignupGeolocation } from "@/lib/geo-country";
import { formatDateOnly } from "@/lib/date-only";
import { normalizeGooglePhone, verifyGoogleIdToken } from "@/lib/google-sso";
import { bannedAccountLoginResponse } from "@/lib/mobile-login-response";
import { clientIp, v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/auth/google";
const methods = "POST, OPTIONS";

const clean = (value, max = 255) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export function OPTIONS(request) { return v1Options(request, methods); }

function validationError(request, requestId, fields) {
  return v1Json(request, requestId, {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Google sign-in data is invalid.",
      fields,
    },
  }, 422, methods);
}

async function findOrCreateGoogleUser(profile, phone, request, requestId) {
  const existingGoogleUser = await prisma.user.findUnique({
    where: { googleSubject: profile.subject },
  });
  if (existingGoogleUser) return { user: existingGoogleUser, created: false };

  const existingEmailUser = await prisma.user.findUnique({ where: { email: profile.email } });
  if (existingEmailUser) {
    if (!profile.emailAuthoritative) {
      const error = new Error("GOOGLE_ACCOUNT_LINK_REQUIRED");
      error.code = "GOOGLE_ACCOUNT_LINK_REQUIRED";
      throw error;
    }
    const user = await prisma.user.update({
      where: { id: existingEmailUser.id },
      data: { googleSubject: profile.subject },
    });
    return { user, created: false };
  }

  const signupGeo = resolveSignupCountry(request);
  if (!signupGeo.country && requiresSignupGeolocation()) {
    const error = new Error("GEOLOCATION_UNAVAILABLE");
    error.code = "GEOLOCATION_UNAVAILABLE";
    throw error;
  }

  const user = await prisma.$transaction(async (tx) => {
    const publicId = await generateNumericPublicId("USR", async (candidate) =>
      tx.user.findUnique({ where: { publicId: candidate }, select: { id: true } }),
    );
    const created = await tx.user.create({
      data: {
        publicId,
        googleSubject: profile.subject,
        name: profile.name,
        email: profile.email,
        phone,
        country: signupGeo.country,
        profileImage: profile.profileImage,
        role: "LISTENER",
        status: "ACTIVE",
      },
    });
    await tx.auditLog.create({
      data: {
        action: "GOOGLE_SSO_REGISTERED",
        category: "AUTHENTICATION",
        entityType: "User",
        entityId: created.publicId,
        description: `User ${created.publicId} registered through Google SSO.`,
        ipAddress: clientIp(request),
        metadata: {
          source: "MOBILE_API_V1",
          googleSubject: profile.subject,
          country: signupGeo.country,
          countrySource: signupGeo.source,
          requestId,
        },
      },
    });
    return created;
  });
  return { user, created: true };
}

export async function POST(request) {
  return withV1Request(
    request,
    { path, methods, rateLimit: { limit: 5, windowMs: 60_000 } },
    async ({ requestId }) => {
      let body;
      try {
        body = await request.json();
      } catch {
        return v1Json(request, requestId, {
          success: false,
          error: { code: "INVALID_JSON", message: "Request body must be valid JSON." },
        }, 400, methods);
      }

      const device = body?.device;
      const deviceId = clean(device?.deviceId);
      const location = clean(device?.location, 500);
      if (!device || typeof device !== "object" || Array.isArray(device) || !deviceId || !location) {
        return validationError(request, requestId, {
          ...(!deviceId ? { "device.deviceId": "A stable Android installation identifier is required." } : {}),
          ...(!location ? { "device.location": "The user's current login location is required." } : {}),
        });
      }

      try {
        const profile = await verifyGoogleIdToken(body?.idToken);
        const { user, created } = await findOrCreateGoogleUser(
          profile,
          normalizeGooglePhone(body?.phone),
          request,
          requestId,
        );

        await reconcileExpiredBans();
        const account = await prisma.user.findUnique({ where: { id: user.id } });
        if (!account) {
          return v1Json(request, requestId, {
            success: false,
            error: { code: "ACCOUNT_UNAVAILABLE", message: "This account is not active." },
          }, 403, methods);
        }
        const ban = await prisma.ban.findFirst({
          where: {
            userId: user.id,
            target: "USER",
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: "desc" },
        });
        const loginAt = new Date();
        const deviceRecord = await prisma.$transaction(async (tx) => {
          const record = await tx.device.upsert({
            where: { userId_macAddress: { userId: user.id, macAddress: deviceId } },
            update: {
              lastLoginIp: clientIp(request),
              location,
              platform: clean(device.platform, 100),
              deviceName: clean(device.deviceName),
              lastLoginAt: loginAt,
            },
            create: {
              userId: user.id,
              macAddress: deviceId,
              lastLoginIp: clientIp(request),
              location,
              platform: clean(device.platform, 100),
              deviceName: clean(device.deviceName),
              lastLoginAt: loginAt,
            },
          });
          await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: loginAt } });
          await tx.auditLog.create({
            data: {
              action: ban ? "BANNED_USER_GOOGLE_LOGIN_ATTEMPT" : record.isBanned ? "BANNED_DEVICE_GOOGLE_LOGIN_ATTEMPT" : "GOOGLE_SSO_LOGIN",
              category: "AUTHENTICATION",
              entityType: "User",
              entityId: user.publicId,
              description: `User ${user.publicId} ${ban ? "attempted Google sign-in while banned" : "signed in through Google SSO"}.`,
              ipAddress: clientIp(request),
              metadata: {
                source: "MOBILE_API_V1",
                deviceId,
                location,
                googleSubject: profile.subject,
                requestId,
                created,
                blocked: Boolean(ban || record.isBanned),
              },
            },
          });
          return record;
        });

        if (ban) return v1Json(request, requestId, bannedAccountLoginResponse(ban), 403, methods);
        if (account.deletedAt || account.status !== "ACTIVE") {
          return v1Json(request, requestId, {
            success: false,
            error: { code: "ACCOUNT_UNAVAILABLE", message: "This account is not active." },
          }, 403, methods);
        }
        if (deviceRecord.isBanned) {
          return v1Json(request, requestId, {
            success: false,
            error: { code: "DEVICE_BANNED", message: "This device has been banned." },
          }, 403, methods);
        }

        await reconcileExpiredSpecialIds();
        const identity = await getEffectiveUserId(account.id, account.publicId);
        const session = mobileSession.createMobileSession(account, { deviceId });
        return v1Json(request, requestId, {
          success: true,
          data: {
            ...session,
            user: {
              id: identity.effectiveId,
              normalId: identity.normalId,
              specialId: identity.specialId,
              specialIdExpiresAt: identity.specialIdExpiresAt?.toISOString() ?? null,
              name: account.name,
              email: account.email,
              phone: account.phone,
              country: account.country,
              bio: account.bio,
              profileImage: account.profileImage,
              gender: account.gender,
              dob: formatDateOnly(account.dob),
              isVerified: Boolean(account.isVerified),
              isOfficial: Boolean(account.isOfficial),
              role: account.role,
              roles: account.appRoles,
              status: account.status,
              vipLevel: account.vipLevel,
              createdAt: account.createdAt.toISOString(),
            },
          },
        }, created ? 201 : 200, methods);
      } catch (error) {
        const known = {
          GOOGLE_SSO_NOT_CONFIGURED: [503, "Google sign-in is not configured on this server."],
          GOOGLE_ID_TOKEN_REQUIRED: [422, "A Google ID token is required."],
          GOOGLE_ID_TOKEN_INVALID: [401, "The Google ID token is invalid or expired."],
          GOOGLE_EMAIL_UNVERIFIED: [403, "Google must verify the email address before it can be used to sign in."],
          GOOGLE_ACCOUNT_LINK_REQUIRED: [409, "Sign in with your existing account before linking this Google account."],
          PHONE_INVALID: [422, "Enter a valid phone number containing 7 to 15 digits."],
          GEOLOCATION_UNAVAILABLE: [503, "Signup country could not be determined from the connection location."],
        };
        const [status, message] = known[error?.code] ?? [500, "Unable to sign in with Google right now."];
        if (error?.code === "P2002") {
          return v1Json(request, requestId, {
            success: false,
            error: { code: "PHONE_ALREADY_REGISTERED", message: "A user with this phone number already exists." },
          }, 409, methods);
        }
        if (!known[error?.code]) console.error("Google SSO failed", error);
        return v1Json(request, requestId, {
          success: false,
          error: { code: error?.code ?? "GOOGLE_SSO_FAILED", message },
        }, status, methods);
      }
    },
  );
}
