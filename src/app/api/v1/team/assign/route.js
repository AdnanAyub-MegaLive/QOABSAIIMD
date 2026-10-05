import { teamRequest } from "@/lib/team-api";
import { v1Options } from "@/lib/mobile-v1";
import { assignTeamMember } from "@/lib/management-team";
export async function POST(request) { return teamRequest(request, "/api/v1/team/assign", "POST, OPTIONS", async user => {
  const body = await request.json();
  if (!body || typeof body.userPublicId !== "string" || !body.userPublicId.trim() || body.userPublicId.length > 100 || typeof body.role !== "string" || body.role.length > 40) throw Object.assign(new Error("A user public ID and role are required."), { code: "TEAM_INPUT_INVALID", status: 422 });
  return assignTeamMember(user.id, body.userPublicId.trim(), body.role);
}); }
export function OPTIONS(request) { return v1Options(request, "POST, OPTIONS"); }
