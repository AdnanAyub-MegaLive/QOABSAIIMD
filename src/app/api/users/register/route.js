import { prisma } from "../../../../lib/prisma";
import { hashPassword } from "../../../../lib/password";
import mobileSession from "../../../../lib/mobile-session.cjs";
import { formatDateOnly, parseDateOnly } from "../../../../lib/date-only";
import { generateNumericPublicId } from "../../../../lib/public-id";
import { requiresSignupGeolocation, resolveSignupCountry } from "../../../../lib/geo-country";

const allowedOrigin = process.env.MOBILE_APP_ORIGIN || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });
const cleanOptional = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function validateRegistration(body) {
  const errors = {};
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone =
    typeof body?.phone === "string"
      ? body.phone.trim().replace(/[\s().-]/g, "")
      : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (name.length < 2 || name.length > 100)
    errors.name = "Name must contain 2 to 100 characters.";
  if (
    email &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  )
    errors.email = "Enter a valid email address.";
  if (!/^\+?[0-9]{7,15}$/.test(phone))
    errors.phone = "Enter a valid phone number containing 7 to 15 digits.";
  if (password.length < 8)
    errors.password = "Password must contain at least 8 characters.";
  if (
    body?.profileImage != null &&
    (typeof body.profileImage !== "string" || body.profileImage.length > 2048)
  )
    errors.profileImage =
      "Profile image must be a URL no longer than 2048 characters.";
  if (body?.dob != null && !parseDateOnly(body.dob))
    errors.dob = "Date of birth must use the YYYY-MM-DD format.";

  const device = body?.device;
  if (device != null && (typeof device !== "object" || Array.isArray(device)))
    errors.device = "Device must be an object.";
  if (
    device &&
    (typeof (device.deviceId ?? device.macAddress) !== "string" || !(device.deviceId ?? device.macAddress).trim())
  )
    errors["device.deviceId"] =
      "A stable Android installation identifier is required when device information is supplied.";

  return { errors, values: { name, email: email || null, phone, password } };
}

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

  const { errors, values } = validateRegistration(body);
  if (Object.keys(errors).length) {
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Registration data is invalid.",
          fields: errors,
        },
      },
      422,
    );
  }

  const signupGeo = resolveSignupCountry(request);
  if (!signupGeo.country && requiresSignupGeolocation()) {
    return json(
      {
        success: false,
        error: {
          code: "GEOLOCATION_UNAVAILABLE",
          message: "Signup country could not be determined from the connection location.",
        },
      },
      503,
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  try {
    const user = await prisma.$transaction(async (tx) => {
      const publicId = await generateNumericPublicId("USR", async (candidate) =>
        tx.user.findUnique({ where: { publicId: candidate }, select: { id: true } }),
      );
      const passwordHash = await hashPassword(values.password);
      const created = await tx.user.create({
        data: {
          publicId,
          name: values.name,
          email: values.email,
          phone: values.phone,
          passwordHash,
          country: signupGeo.country,
          profileImage: cleanOptional(body.profileImage),
          gender: body.gender === null ? null : cleanOptional(body.gender),
          dob: body.dob == null ? null : parseDateOnly(body.dob),
          role: "LISTENER",
          status: "ACTIVE",
          devices: body.device
            ? {
                create: {
                  macAddress: String(body.device.deviceId ?? body.device.macAddress).trim(),
                  lastLoginIp:
                    cleanOptional(body.device.lastLoginIp) || ipAddress,
                  location: cleanOptional(body.device.location),
                  platform: cleanOptional(body.device.platform),
                  deviceName: cleanOptional(body.device.deviceName),
                  lastLoginAt: new Date(),
                },
              }
            : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "USER_REGISTERED",
          category: "USER_MANAGEMENT",
          entityType: "User",
          entityId: created.publicId,
          description: `User ${created.publicId} registered through the mobile application`,
          ipAddress,
          metadata: {
            source: "MOBILE_APP",
            phone: created.phone,
            email: created.email,
            country: created.country,
            countrySource: signupGeo.source,
          },
        },
      });
      return created;
    });

    const session = mobileSession.createMobileSession(user, {
      deviceId: body.device
        ? String(body.device.deviceId ?? body.device.macAddress).trim()
        : undefined,
    });
    return json(
      {
        success: true,
        message: "User registered successfully.",
        data: {
          ...session,
          user: {
            id: user.publicId,
            normalId: user.publicId,
            specialId: null,
            specialIdExpiresAt: null,
            name: user.name,
            email: user.email,
            phone: user.phone,
            country: user.country,
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
            sessionVersion: user.sessionVersion,
          },
        },
      },
      201,
    );
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
    console.error("User registration failed", error);
    return json(
      {
        success: false,
        error: {
          code: "REGISTRATION_FAILED",
          message: "Unable to register the user right now.",
        },
      },
      500,
    );
  }
}
