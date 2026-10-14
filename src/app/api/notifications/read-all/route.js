import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
export function OPTIONS() { return mobileOptions(); }
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const readAt = new Date();
    const count = await prisma.$executeRaw`INSERT INTO "NotificationRead" ("notificationId", "userId", "readAt") SELECT "id", ${user.id}, ${readAt} FROM "Notification" WHERE ("userId" IS NULL OR "userId" = ${user.id}) AND "createdAt" <= ${readAt} ON CONFLICT ("notificationId", "userId") DO NOTHING`;
    return mobileJson({ success: true, data: { updated: count, readAt: readAt.toISOString() } });
  } catch (error) { return mobileApiError(error, "NOTIFICATION_READ_FAILED"); }
}
