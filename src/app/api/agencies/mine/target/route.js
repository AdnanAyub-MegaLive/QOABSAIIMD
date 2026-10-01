import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";

const maximumTarget = 9223372036854775807n;

export function OPTIONS() {
  return mobileOptions();
}

function parseTarget(value) {
  if (
    (typeof value === "number" && !Number.isSafeInteger(value)) ||
    !/^\d+$/.test(String(value ?? ""))
  )
    return null;
  try {
    const target = BigInt(String(value));
    return target <= maximumTarget ? target : null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const owner = await requireMobileUser(request);
    let body;
    try {
      body = await request.json();
    } catch {
      return mobileJson(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } },
        400,
      );
    }
    const targetCoins = parseTarget(body?.targetCoins);
    if (targetCoins === null)
      return mobileJson(
        { success: false, error: { code: "VALIDATION_ERROR", message: "targetCoins must be a non-negative integer." } },
        400,
      );
    const agency = await prisma.agency.findUnique({
      where: { ownerUserId: owner.id },
      select: { id: true, publicId: true, monthlyTargetCoins: true },
    });
    if (!agency)
      return mobileJson(
        { success: false, error: { code: "AGENCY_NOT_FOUND", message: "You do not own an agency." } },
        404,
      );
    await prisma.$transaction([
      prisma.agency.update({
        where: { id: agency.id },
        data: { monthlyTargetCoins: targetCoins },
      }),
      prisma.auditLog.create({
        data: {
          action: "AGENCY_MONTHLY_TARGET_UPDATED",
          category: "AGENCY_MANAGEMENT",
          entityType: "Agency",
          entityId: agency.publicId,
          description: `Agency owner ${owner.publicId} updated the monthly target for ${agency.publicId}.`,
          metadata: {
            source: "MOBILE_AGENCY_OWNER",
            ownerId: owner.publicId,
            previousTargetCoins: agency.monthlyTargetCoins.toString(),
            targetCoins: targetCoins.toString(),
          },
        },
      }),
    ]);
    return mobileJson({
      success: true,
      data: { monthlyTargetCoins: targetCoins.toString() },
    });
  } catch (error) {
    console.error("Agency monthly target update failed", error);
    return mobileApiError(error, "AGENCY_TARGET_UPDATE_FAILED");
  }
}
