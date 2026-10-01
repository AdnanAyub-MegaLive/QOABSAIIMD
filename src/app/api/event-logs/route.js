import { prisma } from "../../../lib/prisma.js";
import { requireEventUser } from "../../../lib/events/auth.js";
import { eventErrorResponse, eventJson } from "../../../lib/events/errors.js";

export async function GET(request) {
  try {
    await requireEventUser(request, { roles: ["SUPER_ADMIN"] });
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    const logs = await prisma.eventAuditLog.findMany({
      where: q
        ? {
            OR: [
              { action: { contains: q, mode: "insensitive" } },
              { user: { name: { contains: q, mode: "insensitive" } } },
              { user: { email: { contains: q, mode: "insensitive" } } },
              { event: { slug: { contains: q, mode: "insensitive" } } },
            ],
          }
        : undefined,
      include: {
        user: { select: { name: true, email: true, role: true } },
        event: { select: { publicId: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return eventJson({ success: true, data: { logs } });
  } catch (error) {
    return eventErrorResponse(error);
  }
}
