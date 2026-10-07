import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { portalPermissionError } from "@/lib/portal-admin";

export async function GET(request) {
  const denied = await portalPermissionError("rooms.view");
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const roomId = params.get("roomId");
  const page = Number(params.get("page") || 1);
  if (!roomId || !Number.isSafeInteger(page) || page < 1 || page > 10000)
    return Response.json({ success: false, error: { message: "Choose a room and valid page." } }, { status: 422 });
  const room = await prisma.audioRoom.findUnique({ where: { roomId }, select: { id: true } });
  if (!room) return Response.json({ success: false, error: { message: "Room not found." } }, { status: 404 });
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT * FROM (
      SELECT 'room-' || m."id" AS id, m."action", m."reason", m."createdAt",
        u."name" AS actor, t."name" AS target
      FROM "AudioRoomModerationLog" m
      JOIN "User" u ON u.id = m."actorId"
      LEFT JOIN "User" t ON t.id = m."targetId"
      WHERE m."audioRoomId" = ${room.id}
      UNION ALL
      SELECT 'audit-' || a.id, a.action, a.description, a."createdAt", COALESCE(ad.name, 'System'), NULL
      FROM "AuditLog" a LEFT JOIN "Admin" ad ON ad.id = a."adminId"
      WHERE (a."entityType" = 'AudioRoom' AND a."entityId" = ${roomId})
        OR (a."entityType" = 'AudioRoomBan' AND a."entityId" IN
          (SELECT "publicId" FROM "AudioRoomBan" WHERE "audioRoomId" = ${room.id}))
    ) history ORDER BY "createdAt" DESC, id DESC LIMIT 51 OFFSET ${(page - 1) * 50}
  `);
  return Response.json({ success: true, data: { roomId, page, hasMore: rows.length > 50, logs: rows.slice(0, 50) } }, { headers: { "Cache-Control": "no-store" } });
}
