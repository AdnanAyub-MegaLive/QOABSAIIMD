import { teamRequest } from "@/lib/team-api";
import { v1Options } from "@/lib/mobile-v1";
import { requestOrigin } from "@/lib/user-perks";
import { teamCandidates } from "@/lib/management-team";
export async function GET(request) { return teamRequest(request, "/api/v1/team/candidates", "GET, OPTIONS", async user => { const query=new URL(request.url).searchParams; return { candidates: await teamCandidates(user.id, String(query.get("role")??"").slice(0,40), String(query.get("q")??"").trim().slice(0,100), requestOrigin(request)) }; }); }
export function OPTIONS(request) { return v1Options(request, "GET, OPTIONS"); }
