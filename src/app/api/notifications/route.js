import { notificationDto } from "@/lib/action-notifications";
import { inboxWhere, notificationPage, notificationCursor } from "@/lib/notification-inbox";
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
    const { limit, boundary } = notificationPage(new URL(request.url));
    const visibility = inboxWhere(user.id);
    const [records, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where: { AND: [visibility, boundary] }, include: { reads: { where: { userId: user.id }, select: { readAt: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 }),
      prisma.notification.count({ where: { AND: [visibility, { reads: { none: { userId: user.id } } }] } }),
    ]);
    const page = records.slice(0, limit);
    return mobileJson({ success: true, data: { notifications: page.map(notificationDto), unreadCount, nextCursor: records.length > limit ? notificationCursor(page.at(-1)) : null } });
  } catch (error) { return mobileApiError(error, "NOTIFICATIONS_FAILED"); }
}

export { POST } from "../admin/notifications/route";
