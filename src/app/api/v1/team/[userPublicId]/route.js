import { teamRequest } from "@/lib/team-api";
import { v1Options } from "@/lib/mobile-v1";
import { removeTeamMember } from "@/lib/management-team";
export async function DELETE(request, {params}) { return teamRequest(request, "/api/v1/team/:userPublicId", "DELETE, OPTIONS", async user => removeTeamMember(user.id,(await params).userPublicId)); }
export function OPTIONS(request) { return v1Options(request, "DELETE, OPTIONS"); }
