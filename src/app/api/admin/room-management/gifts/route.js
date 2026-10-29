import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  try {
    await requirePermission("rooms.view");
    const params = new URL(request.url).searchParams;
    const roomId = params.get("roomId") ?? "";
    const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get("page"))) || 1));
    const q = (params.get("q") ?? "").trim().slice(0, 100);
    const room = await prisma.audioRoom.findUnique({ where: { roomId }, select: { id: true } });
    if (!room) return Response.json({ success: false, error: { code: "ROOM_NOT_FOUND", message: "Room not found." } }, { status: 404 });
    const identity = { OR: [{ publicId: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] };
    const where = { roomId, ...(q ? { OR: [{ giftName: { contains: q, mode: "insensitive" } }, { sender: identity }, { recipientUser: identity }] } : {}) };
    const select = { publicId: true, name: true };
    const [total, rows] = await prisma.$transaction([
      prisma.giftTransaction.count({ where }),
      prisma.giftTransaction.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25, select: { id: true, giftName: true, quantity: true, coinValue: true, createdAt: true, reversedAt: true, sender: { select }, recipientUser: { select }, talent: { select: { publicId: true, displayName: true } } } }),
    ]);
    return Response.json({ success: true, data: { roomId, page, pageSize: 25, total, items: rows.map(row => ({ ...row, coinValue: row.coinValue.toString(), recipient: row.recipientUser ?? (row.talent ? { publicId: row.talent.publicId, name: row.talent.displayName } : null), recipientUser: undefined, talent: undefined })) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!error.status) console.error("Room gift history failed", { code: error.code });
    return Response.json({ success: false, error: { code: error.status ? error.code : "ROOM_GIFT_HISTORY_FAILED", message: error.status ? error.message : "Unable to load gift history." } }, { status: error.status ?? 500 });
  }
}
