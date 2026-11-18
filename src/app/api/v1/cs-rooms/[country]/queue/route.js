import { prisma } from "@/lib/prisma";
import { v1Options } from "@/lib/mobile-v1";
import { csRoomRequest, csRoomState } from "@/lib/cs-room-api";
import { csRoomCountry, joinCsQueue, leaveCsQueue } from "@/lib/cs-rooms";
export const runtime = "nodejs";
const path = "/api/v1/cs-rooms/[country]/queue", methods = "POST, DELETE, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request, { params }) {
  const { country: raw } = await params;
  return csRoomRequest(request, path, methods, async (user) => {
    const country = csRoomCountry(raw, user);
    await joinCsQueue(prisma, user, country);
    return csRoomState(request, user, country);
  });
}
export async function DELETE(request, { params }) {
  const { country: raw } = await params;
  return csRoomRequest(request, path, methods, async (user) => {
    const country = csRoomCountry(raw, user);
    await leaveCsQueue(prisma, user);
    return csRoomState(request, user, country);
  });
}
