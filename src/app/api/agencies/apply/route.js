import { prisma } from "../../../../lib/prisma";
import mobileSession from "../../../../lib/mobile-session.cjs";
import { assertMobileSession, mobileSessionError } from "../../../../lib/mobile-session-state";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function error(code, message, status, fields) {
  return json(
    { success: false, error: { code, message, ...(fields ? { fields } : {}) } },
    status,
  );
}

function text(payload, key, maxLength) {
  const raw = typeof payload?.get === "function" ? payload.get(key) : payload?.[key];
  const value = String(raw ?? "").trim();
  return value && value.length <= maxLength ? value : null;
}

async function authenticatedUser(request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const payload = mobileSession.verifyMobileSessionToken(token);
  const user = await prisma.user.findUnique({
    where: { publicId: payload.userId },
    select: {
      id: true,
      publicId: true,
      email: true,
      country: true,
      deletedAt: true,
      status: true,
      sessionVersion: true,
      forcedLogoutAt: true,
    },
  });
  return assertMobileSession(user, payload);
}

export async function POST(request) {
  let user;
  try {
    user = await authenticatedUser(request);
  } catch (exception) {
    const sessionError = mobileSessionError(exception?.message).error;
    return error(
      sessionError.code,
      sessionError.message,
      401,
    );
  }

  let payload;
  try {
    payload = request.headers.get("content-type")?.includes("application/json")
      ? await request.json()
      : await request.formData();
  } catch {
    return error(
      "VALIDATION",
      "Request body must be JSON or multipart/form-data.",
      422,
    );
  }

  const agencyName = text(payload, "agencyName", 120);
  const whatsapp = text(payload, "whatsapp", 40);
  const bdCode = text(payload, "bdCode", 50);
  const email = user.email?.trim().toLowerCase() || null;
  const fields = {};
  if (!agencyName)
    fields.agencyName =
      "Agency name is required and cannot exceed 120 characters.";
  if (!whatsapp)
    fields.whatsapp =
      "WhatsApp number is required and cannot exceed 40 characters.";
  if (!bdCode)
    fields.bdCode = "BD code is required and cannot exceed 50 characters.";
  if (Object.keys(fields).length)
    return error(
      "VALIDATION",
      "Agency application data is invalid.",
      422,
      fields,
    );

  try {
    const existing = await prisma.agencyApplication.findFirst({
      where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] } },
      select: { publicId: true, status: true },
    });
    if (existing)
      return error(
        existing.status === "APPROVED" ? "ALREADY_HAS_AGENCY" : "ALREADY_APPLIED",
        existing.status === "APPROVED"
          ? "You already have an approved agency application."
          : "You already have a pending application.",
        409,
      );

    const rejectedAttempts = await prisma.agencyApplication.count({
      where: {
        userId: user.id,
        status: "REJECTED",
        bdCode: { equals: bdCode, mode: "insensitive" },
      },
    });
    if (rejectedAttempts >= 3)
      return error(
        "ADMIN_ID_ATTEMPT_LIMIT_REACHED",
        "You cannot apply again with this Admin ID after three rejected applications. Use a different Admin ID.",
        409,
        { bdCode: "The three-application limit for this Admin ID has been reached." },
      );

    const publicId = `AGA-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.agencyApplication.create({
        data: {
          publicId,
          userId: user.id,
          agencyName,
          email,
          whatsapp,
          bdCode,
          country: user.country,
        },
        select: { publicId: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          action: "AGENCY_APPLICATION_SUBMITTED",
          category: "AGENCY_MANAGEMENT",
          entityType: "AgencyApplication",
          entityId: created.publicId,
          description: `User ${user.publicId} submitted an agency application for ${agencyName}.`,
          metadata: {
            userId: user.publicId,
            agencyName,
            bdCode,
            country: user.country,
          },
        },
      });
      return created;
    });

    return json(
      {
        success: true,
        data: {
          applicationId: application.publicId,
          status: application.status,
          attemptsRemainingForAdminId: Math.max(0, 2 - rejectedAttempts),
        },
      },
      201,
    );
  } catch (errorValue) {
    console.error("Agency application submission failed", errorValue);
    return error(
      "SUBMISSION_FAILED",
      "Unable to submit the agency application right now.",
      500,
    );
  }
}
