import { prisma } from "@/lib/prisma";
import { v1Options } from "@/lib/mobile-v1";
import { csRoomRequest, csRoomState } from "@/lib/cs-room-api";
import { csRoomCountry, enterCsRoom, heartbeatCsRoom, leaveCsRoom } from "@/lib/cs-rooms";
export const runtime = "nodejs";
const path = "/api/v1/cs-rooms/[country]", methods = "POST, PATCH, DELETE, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request, { params }) {
  const { country: raw } = await params;
  return csRoomRequest(request, path, methods, async (user) => {
    const country = csRoomCountry(raw);
    await enterCsRoom(prisma, user, country);
    return csRoomState(request, user, country, true);
  });
}
export async function PATCH(request, { params }) {
  const { country: raw } = await params;
  return csRoomRequest(request, path, methods, async (user) => {
    const country = csRoomCountry(raw);
    await heartbeatCsRoom(prisma, user, country);
    return csRoomState(request, user, country);
  });
}
export async function DELETE(request, { params }) {
  await params;
  return csRoomRequest(request, path, methods, async (user) => {
    await leaveCsRoom(prisma, user);
    return csRoomState(request, user);
  });
}
