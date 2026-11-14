import { teamRequest } from "@/lib/team-api";
import { v1Options } from "@/lib/mobile-v1";
import { respondTeamInvitation } from "@/lib/management-team";
export async function POST(request, {params}) { return teamRequest(request, "/api/v1/team/invitations/:invitationId", "POST, OPTIONS", async user => {
  const body = await request.json(), invitationId = (await params).invitationId;
  if (!body || typeof body.action !== "string" || !["ACCEPT", "DECLINE", "CANCEL"].includes(body.action) || typeof invitationId !== "string" || invitationId.length > 40) throw Object.assign(new Error("Action must be ACCEPT, DECLINE or CANCEL."), { code: "TEAM_INPUT_INVALID", status: 422 });
  return respondTeamInvitation(user.id, invitationId, body.action);
}); }
export function OPTIONS(request) { return v1Options(request, "POST, OPTIONS"); }
