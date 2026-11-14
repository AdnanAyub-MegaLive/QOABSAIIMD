import { teamRequest } from "@/lib/team-api";
import { v1Options } from "@/lib/mobile-v1";
import { requestOrigin } from "@/lib/user-perks";
import { listTeamInvitations } from "@/lib/management-team";
export async function GET(request) { return teamRequest(request, "/api/v1/team/invitations", "GET, OPTIONS", async user => listTeamInvitations(user.id, requestOrigin(request))); }
export function OPTIONS(request) { return v1Options(request, "GET, OPTIONS"); }
