import { v1Options } from "@/lib/mobile-v1";
import { csRoomRequest, csRoomState } from "@/lib/cs-room-api";
export const runtime = "nodejs";
const path = "/api/v1/cs-rooms", methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export function GET(request) {
  return csRoomRequest(request, path, methods, (user) => csRoomState(request, user));
}
