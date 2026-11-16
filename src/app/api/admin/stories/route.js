import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { storyError, storyMediaResponse } from "@/lib/stories";
const fail = (e) =>
  Response.json(
    {
      success: false,
      error: { message: e.status ? e.message : "Unable to review stories." },
    },
    { status: e.status ?? 500 },
  );
export async function GET(request) {
  try {
    await requirePermission("content.view");
    const q = new URL(request.url).searchParams;
    if (q.get("media")) {
      const row = await prisma.story.findFirst({
        where: {
          publicId: q.get("media"),
          deletedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!row) throw storyError("Story unavailable.", 404);
      return storyMediaResponse(row, request);
    }
    const status = q.get("status") ?? "PENDING",
      page = Math.max(0, Math.min(10000, Number(q.get("page")) || 0));
    if (!["PENDING", "APPROVED", "REJECTED", "REPORTED"].includes(status))
      throw storyError("Invalid filter.");
    const rows = await prisma.story.findMany({
      where: {
        deletedAt: null,
        ...(status === "REPORTED"
          ? { reports: { some: { status: "OPEN" } } }
          : { status }),
      },
      include: {
        author: { select: { publicId: true, name: true } },
        reports: { select: { reason: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: page * 30,
      take: 31,
    });
    return Response.json({
      success: true,
      data: {
        items: rows
          .slice(0, 30)
          .map(({ fingerprint, mediaKey, authorId, ...row }) => ({
            ...row,
            hasMedia: !!mediaKey,
          })),
        hasMore: rows.length > 30,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request) {
  try {
    const admin = await requirePermission("content.edit"),
      body = await request.json();
    if (
      !["APPROVED", "REJECTED", "REMOVED"].includes(body.status) ||
      !Number.isInteger(body.revision) ||
      typeof body.id !== "string"
    )
      throw storyError("Invalid review.");
    await prisma.$transaction(async (tx) => {
      const row = await tx.story.findUnique({
        where: { publicId: body.id },
        include: { author: { select: { publicId: true } } },
      });
      if (!row) throw storyError("Story unavailable.", 404);
      const changed = await tx.story.updateMany({
        where: { id: row.id, reviewRevision: body.revision },
        data: {
          status: body.status === "REMOVED" ? "REJECTED" : body.status,
          reviewReason: String(body.reason ?? "").slice(0, 500),
          reviewRevision: { increment: 1 },
          ...(body.status === "REMOVED" ? { deletedAt: new Date() } : {}),
        },
      });
      if (!changed.count)
        throw storyError("Story changed. Refresh before reviewing.", 409);
      if (body.status === "REMOVED" && row.mediaKey)
        await tx.storyMediaObject.updateMany({
          where: { key: row.mediaKey },
          data: { expiresAt: new Date() },
        });
      await tx.storyReport.updateMany({
        where: { storyId: row.id },
        data: { status: "RESOLVED" },
      });
      await tx.auditLog.create({
        data: {
          action: "STORY_REVIEWED",
          category: "CONTENT_MANAGEMENT",
          entityType: "Story",
          entityId: row.publicId,
          description: `Story ${body.status}`,
          metadata: { adminId: admin.id },
        },
      });
      if (
        body.status === "APPROVED" &&
        row.status !== "APPROVED" &&
        !row.deletedAt &&
        row.expiresAt > new Date()
      ) {
        const followers = await tx.userFollow.findMany({
          where: { followedId: row.authorId },
          select: { follower: { select: { publicId: true } } },
        });
        await tx.realtimeOutbox.createMany({
          data: [
            row.author.publicId,
            ...followers.map((f) => f.follower.publicId),
          ].map((id) => ({
            channel: `user:${id}`,
            event: "story:new",
            payload: { refresh: true },
          })),
        });
      }
    });
    return Response.json({ success: true, data: { saved: true } });
  } catch (e) {
    return fail(e);
  }
}
