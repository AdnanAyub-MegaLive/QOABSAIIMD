import { prisma } from "@/lib/prisma";

export async function GET(_request, { params }) {
  const { roomId } = await params;
  const room = await prisma.audioRoom.findUnique({
    where: { roomId: decodeURIComponent(roomId) },
    select: { coverImageData: true, coverImageMime: true },
  });
  if (!room?.coverImageData || !room.coverImageMime)
    return Response.json(
      {
        success: false,
        error: {
          code: "ROOM_COVER_NOT_FOUND",
          message: "Room cover image not found.",
        },
      },
      { status: 404 },
    );

  return new Response(room.coverImageData, {
    headers: {
      "Content-Type": room.coverImageMime,
      "Content-Length": String(room.coverImageData.byteLength),
      "Cache-Control": "no-cache, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
    },
  });
}
