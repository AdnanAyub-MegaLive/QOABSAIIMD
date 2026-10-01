import { prisma } from "../../../../lib/prisma";
import { hashPassword, verifyPassword } from "../../../../lib/password";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../lib/mobile-api";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    let body;
    try {
      body = await request.json();
    } catch {
      return mobileJson(
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

    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";
    const fields = {};
    if (!currentPassword)
      fields.currentPassword = "Current password is required.";
    if (newPassword.length < 8 || newPassword.length > 128)
      fields.newPassword =
        "New password must contain between 8 and 128 characters.";
    if (Object.keys(fields).length)
      return mobileJson(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Password data is invalid.",
            fields,
          },
        },
        422,
      );

    const storedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (
      !storedUser?.passwordHash ||
      !(await verifyPassword(currentPassword, storedUser.passwordHash))
    )
      return mobileJson(
        {
          success: false,
          error: {
            code: "CURRENT_PASSWORD_INCORRECT",
            message: "The current password is incorrect.",
          },
        },
        401,
      );
    if (await verifyPassword(newPassword, storedUser.passwordHash))
      return mobileJson(
        {
          success: false,
          error: {
            code: "PASSWORD_UNCHANGED",
            message: "New password must be different from the current password.",
          },
        },
        422,
      );

    const passwordHash = await hashPassword(newPassword);
    const changedAt = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.auditLog.create({
        data: {
          action: "USER_PASSWORD_CHANGED",
          category: "SECURITY",
          entityType: "User",
          entityId: user.publicId,
          description: `User ${user.publicId} changed their password through the mobile application.`,
          metadata: {
            source: "MOBILE_APP",
            sessionPreserved: true,
            changedAt: changedAt.toISOString(),
          },
        },
      }),
    ]);

    return mobileJson({
      success: true,
      data: {
        passwordChanged: true,
        changedAt: changedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Self-service password change failed", error);
    return mobileApiError(error, "PASSWORD_CHANGE_FAILED");
  }
}
