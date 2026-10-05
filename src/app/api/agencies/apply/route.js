import { submitAgencyApplication } from "@/lib/agency-management";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { prisma } from "../../../../lib/prisma";

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

export async function POST(request) {
  let user;
  try {
    const sessionUser = await requireMobileUser(request);
    user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  } catch (exception) {
    return mobileApiError(exception);
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
    const data = await prisma.$transaction(
      tx => submitAgencyApplication(tx, user, { agencyName, whatsapp, bdCode }),
      { isolationLevel: "Serializable" },
    );
    return json({ success: true, data }, 201);
  } catch (exception) {
    return mobileApiError(exception, "SUBMISSION_FAILED");
  }
}
