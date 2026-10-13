import { prisma } from "../../../../lib/prisma";
import mobileSession from "../../../../lib/mobile-session.cjs";
import {
  getEffectiveUserId,
  reconcileExpiredSpecialIds,
} from "../../../../lib/special-id";
import { formatDateOnly } from "../../../../lib/date-only";
import {
  assertMobileSession,
} from "../../../../lib/mobile-session-state";
import { normalizeProfileBio } from "../../../../lib/profile-bio";
import { avatarDisplayUrl, updateProfileWithHistory } from "@/lib/avatar-history";
import { requireMobileUser, mobileApiError } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { profileEditChanges, profileEditPermissions } from "@/lib/profile-edit-policy";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function optionalString(
  body,
  key,
  { lowercase = false, normalizePhone = false } = {},
) {
  if (!Object.hasOwn(body, key)) return undefined;
  if (body[key] === null) return null;
  if (typeof body[key] !== "string") return undefined;
  let value = body[key].trim();
  if (normalizePhone) value = value.replace(/[\s().-]/g, "");
  if (lowercase) value = value.toLowerCase();
  return value || null;
}

export async function PATCH(request) {
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

  try {
    await requireMobileUser(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ success: false, error: { code: "VALIDATION_ERROR", message: "Provide a profile object." } }, 422);
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    const payload = mobileSession.verifyMobileSessionToken(token);
    const current = await prisma.user.findUnique({
      where: { publicId: payload.userId },
    });
    assertMobileSession(current, payload);

    const data = {};
    const name = optionalString(body, "name");
    const phone = optionalString(body, "phone", { normalizePhone: true });
    const email = optionalString(body, "email", { lowercase: true });
    if ((Object.hasOwn(body, "phone") && phone !== current.phone) ||
        (current.googleSubject && Object.hasOwn(body, "email") && email !== current.email)) {
      return json({ success: false, error: { code: "ACCOUNT_CONNECTION_REQUIRED", message: "Use the account connection flow to change login details." } }, 422);
    }
    const profileImage = optionalString(body, "profileImage");
    if (Object.hasOwn(body, "profileImage") && body.profileImage !== null &&
        (typeof body.profileImage !== "string" || body.profileImage.length > 2048 || (profileImage && !avatarDisplayUrl(profileImage, requestOrigin(request)))))
      return json({ success: false, error: { code: "VALIDATION_ERROR", message: "Provide a display URL or avatar preset.", fields: { profileImage: "Invalid profile picture." } } }, 422);
    const bio = Object.hasOwn(body, "bio") ? normalizeProfileBio(body.bio) : undefined;
    if (bio?.error)
      return json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Profile data is invalid.",
            fields: { bio: bio.error },
          },
        },
        422,
      );
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (email !== undefined) data.email = email;
    if (profileImage !== undefined) data.profileImage = profileImage;
    if (bio !== undefined) data.bio = bio.value;
    if (Object.hasOwn(body, "profilePrivate")) data.profilePrivate = Boolean(body.profilePrivate);
    if (Object.hasOwn(body, "showDateOfBirth")) data.showDateOfBirth = Boolean(body.showDateOfBirth);

    if (!Object.keys(data).length && !["country", "dob", "gender", "completeOnboarding"].some(key => Object.hasOwn(body, key)))
      return json(
        {
          success: false,
          error: {
            code: "NO_PROFILE_CHANGES",
            message: "No supported profile fields were supplied.",
          },
        },
        422,
      );
    if (data.name === null || data.phone === null)
      return json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Name and phone cannot be empty.",
          },
        },
        422,
      );

    const user = await updateProfileWithHistory(prisma, current.id, data, async (tx, lockedUser) => {
      assertMobileSession(lockedUser, payload);
      // Recheck credentials after the lock, too: a concurrent link must not be overwritten.
      if ((phone !== undefined && phone !== lockedUser.phone) ||
          (lockedUser.googleSubject && email !== undefined && email !== lockedUser.email))
        throw Object.assign(new Error("Use the account connection flow to change login details."), { status: 422, code: "ACCOUNT_CONNECTION_REQUIRED" });
      const changes = profileEditChanges(lockedUser, body);
      Object.assign(data, changes);
      if (Object.keys(changes).length) await tx.auditLog.create({ data: {
        action: "PROFILE_IDENTITY_UPDATED", category: "USER", entityType: "User", entityId: lockedUser.publicId,
        description: "Updated onboarding/profile identity fields.", metadata: { fields: Object.keys(changes) },
      } });
    });
    await reconcileExpiredSpecialIds();
    const identity = await getEffectiveUserId(user.id, user.publicId);
    return json({
      success: true,
      data: {
        user: {
          ...profileEditPermissions(user),
          id: identity.effectiveId,
          normalId: identity.normalId,
          specialId: identity.specialId,
          specialIdExpiresAt:
            identity.specialIdExpiresAt?.toISOString() ?? null,
          name: user.name,
          phone: user.phone,
          email: user.email,
          country: user.country,
          bio: user.bio,
          profileImage: user.profileImage,
          gender: user.gender,
          dob: formatDateOnly(user.dob),
          profilePrivate: Boolean(user.profilePrivate),
          showDateOfBirth: Boolean(user.showDateOfBirth),
          isVerified: Boolean(user.isVerified),
          isOfficial: Boolean(user.isOfficial),
          role: user.role,
          roles: user.appRoles,
          status: user.status,
          vipLevel: user.vipLevel,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    if (error.status) return json({ success: false, error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }, error.status);
    if (error?.code === "P2002") {
      const fields = Array.isArray(error.meta?.target)
        ? error.meta.target.join(" ")
        : String(error.meta?.target ?? "");
      const phoneConflict = fields.includes("phone");
      return json(
        {
          success: false,
          error: {
            code: phoneConflict
              ? "PHONE_ALREADY_REGISTERED"
              : "EMAIL_ALREADY_REGISTERED",
            message: phoneConflict
              ? "A user with this phone number already exists."
              : "A user with this email address already exists.",
          },
        },
        409,
      );
    }
    return mobileApiError(error, "PROFILE_UPDATE_FAILED");
  }
}
