import { teamRequest } from "@/lib/team-api";
import { v1Options } from "@/lib/mobile-v1";
import { requestOrigin } from "@/lib/user-perks";
import { readTeam } from "@/lib/management-team";
export async function GET(request) { return teamRequest(request, "/api/v1/team", "GET, OPTIONS", async user => readTeam(user.id, requestOrigin(request))); }
export function OPTIONS(request) { return v1Options(request, "GET, OPTIONS"); }
