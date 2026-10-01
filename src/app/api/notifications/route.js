import { portalPermissionError } from "@/lib/portal-admin";
import { auth } from "../../../../auth";
import { prisma } from "../../../lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../lib/mobile-api";

export const dynamic = "force-dynamic";
export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit")) || 50, 1),
      100,
    );
    const records = await prisma.notification.findMany({
      where: { OR: [{ userId: null }, { userId: user.id }] },
      include: {
        reads: { where: { userId: user.id }, select: { readAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return mobileJson({
      success: true,
      data: {
        notifications: records.map((notification) => ({
          id: notification.publicId,
          title: notification.title,
          body: notification.body,
          createdAt: notification.createdAt.toISOString(),
          readAt: notification.reads[0]?.readAt?.toISOString() ?? null,
        })),
      },
    });
  } catch (error) {
    console.error("Notification list failed", error);
    return mobileApiError(error, "NOTIFICATIONS_FAILED");
  }
}

export async function POST(request) {
  const permissionDenied = await portalPermissionError("notifications.manage");
  if (permissionDenied) return permissionDenied;

  const session = await auth();
  if (!session?.user)
    return mobileJson(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Administrator authentication is required.",
        },
      },
      401,
    );
  try {
    const body = await request.json();
    const title = String(body?.title ?? "").trim();
    const messageBody = String(body?.body ?? "").trim();
    const targetPublicId = String(body?.userId ?? "").trim() || null;
    if (
      !title ||
      title.length > 120 ||
      !messageBody ||
      messageBody.length > 2000
    )
      return mobileJson(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Title must contain 1 to 120 characters and body 1 to 2000 characters.",
          },
        },
        422,
      );
    const target = targetPublicId
      ? await prisma.user.findFirst({
          where: { publicId: targetPublicId, deletedAt: null },
          select: { id: true, publicId: true },
        })
      : null;
    if (targetPublicId && !target)
      return mobileJson(
        {
          success: false,
          error: { code: "USER_NOT_FOUND", message: "User not found." },
        },
        404,
      );
    const notification = await prisma.notification.create({
      data: {
        publicId: `NOT-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        userId: target?.id ?? null,
        title,
        body: messageBody,
      },
    });
    const notificationData = {
      id: notification.publicId,
      title,
      body: messageBody,
      createdAt: notification.createdAt.toISOString(),
    };
    if (target)
      globalThis.portalIo
        ?.to(`user:${target.publicId}`)
        .emit("notification:new", notificationData);
    else globalThis.portalIo?.emit("notification:new", notificationData);
    return mobileJson(
      { success: true, data: { notification: notificationData } },
      201,
    );
  } catch (error) {
    console.error("Notification creation failed", error);
    return mobileApiError(error, "NOTIFICATION_CREATE_FAILED");
  }
}
