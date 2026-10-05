import { prisma } from "../../../../lib/prisma";
import mobileSession from "../../../../lib/mobile-session.cjs";
import {
  getEffectiveUserId,
  reconcileExpiredSpecialIds,
} from "../../../../lib/special-id";
import { formatDateOnly, parseDateOnly } from "../../../../lib/date-only";
import {
  assertMobileSession,
  mobileSessionError,
} from "../../../../lib/mobile-session-state";
import { normalizeProfileBio } from "../../../../lib/profile-bio";

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
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    const payload = mobileSession.verifyMobileSessionToken(token);
    const current = await prisma.user.findUnique({
      where: { publicId: payload.userId },
    });
    assertMobileSession(current, payload);

    const lockedFields = {};
    if (current.gender !== null && Object.hasOwn(body, "gender"))
      lockedFields.gender = "This field cannot be changed once set.";
    if (current.dob !== null && Object.hasOwn(body, "dob"))
      lockedFields.dob = "This field cannot be changed once set.";
    if (Object.keys(lockedFields).length)
      return json(
        {
          success: false,
          error: {
            code: "FIELD_LOCKED",
            message:
              "Gender and date of birth can only be set once and cannot be changed.",
            fields: lockedFields,
          },
        },
        409,
      );

    const data = {};
    if (Object.hasOwn(body, "country"))
      return json(
        {
          success: false,
          error: {
            code: "COUNTRY_MANAGED_BY_GEOLOCATION",
            message: "Country is assigned at signup and cannot be edited in the mobile profile.",
          },
        },
        403,
      );
    const name = optionalString(body, "name");
    const phone = optionalString(body, "phone", { normalizePhone: true });
    const email = optionalString(body, "email", { lowercase: true });
    const profileImage = optionalString(body, "profileImage");
    const bio = Object.hasOwn(body, "bio") ? normalizeProfileBio(body.bio) : undefined;
    const gender = optionalString(body, "gender");
    const dob = Object.hasOwn(body, "dob")
      ? body.dob === null
        ? null
        : parseDateOnly(body.dob)
      : undefined;
    if (Object.hasOwn(body, "dob") && body.dob !== null && !dob)
      return json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Profile data is invalid.",
            fields: { dob: "Date of birth must use the YYYY-MM-DD format." },
          },
        },
        422,
      );
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
    if (gender !== undefined) data.gender = gender;
    if (dob !== undefined) data.dob = dob;
    if (Object.hasOwn(body, "profilePrivate")) data.profilePrivate = Boolean(body.profilePrivate);
    if (Object.hasOwn(body, "showDateOfBirth")) data.showDateOfBirth = Boolean(body.showDateOfBirth);

    if (!Object.keys(data).length)
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

    const user = await prisma.user.update({ where: { id: current.id }, data });
    await reconcileExpiredSpecialIds();
    const identity = await getEffectiveUserId(user.id, user.publicId);
    return json({
      success: true,
      data: {
        user: {
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
    return json(mobileSessionError(error?.message), 401);
  }
}
