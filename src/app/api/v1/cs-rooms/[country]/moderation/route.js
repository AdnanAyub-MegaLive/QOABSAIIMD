import { prisma } from "@/lib/prisma";
import { v1Options } from "@/lib/mobile-v1";
import { csRoomRequest, csRoomState } from "@/lib/cs-room-api";
import { csRoomCountry, moderateCsRoom } from "@/lib/cs-rooms";
export const runtime = "nodejs";
const path = "/api/v1/cs-rooms/[country]/moderation", methods = "POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request, { params }) {
  const { country: raw } = await params;
  return csRoomRequest(request, path, methods, async (user) => {
    const country = csRoomCountry(raw, user);
    const body = await request.json();
    await moderateCsRoom(prisma, user, country, body ?? {});
    return csRoomState(request, user, country);
  });
}
