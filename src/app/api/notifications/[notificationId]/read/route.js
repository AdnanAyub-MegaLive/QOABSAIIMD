import { prisma } from "../../../../../lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../../lib/mobile-api";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { notificationId } = await params;
    const notification = await prisma.notification.findFirst({
      where: {
        publicId: decodeURIComponent(notificationId),
        OR: [{ userId: null }, { userId: user.id }],
      },
      select: { id: true, publicId: true },
    });
    if (!notification) throw new Error("NOTIFICATION_NOT_FOUND");
    const readAt = new Date();
    await prisma.notificationRead.upsert({
      where: {
        notificationId_userId: {
          notificationId: notification.id,
          userId: user.id,
        },
      },
      update: { readAt },
      create: { notificationId: notification.id, userId: user.id, readAt },
    });
    return mobileJson({
      success: true,
      data: {
        notificationId: notification.publicId,
        readAt: readAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Notification read update failed", error);
    return mobileApiError(error, "NOTIFICATION_READ_FAILED");
  }
}
