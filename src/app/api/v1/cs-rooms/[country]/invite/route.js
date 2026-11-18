import { prisma } from "@/lib/prisma";
import { v1Options } from "@/lib/mobile-v1";
import { csRoomRequest, csRoomState } from "@/lib/cs-room-api";
import { answerCsInvite, csRoomCountry } from "@/lib/cs-rooms";
export const runtime = "nodejs";
const path = "/api/v1/cs-rooms/[country]/invite", methods = "POST, DELETE, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request, { params }) {
  const { country: raw } = await params;
  return csRoomRequest(request, path, methods, async (user) => {
    const country = csRoomCountry(raw, user);
    await answerCsInvite(prisma, user, country, true);
    return csRoomState(request, user, country, true);
  });
}
export async function DELETE(request, { params }) {
  const { country: raw } = await params;
  return csRoomRequest(request, path, methods, async (user) => {
    const country = csRoomCountry(raw, user);
    await answerCsInvite(prisma, user, country, false);
    return csRoomState(request, user, country);
  });
}
