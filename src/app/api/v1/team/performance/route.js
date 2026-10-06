import { teamRequest } from "@/lib/team-api";
import { managementPerformance } from "@/lib/management-business";
import { v1Options } from "@/lib/mobile-v1";
export function OPTIONS(r){return v1Options(r,"GET, OPTIONS");}
export function GET(r){const q=new URL(r.url).searchParams;return teamRequest(r,"/api/v1/team/performance","GET, OPTIONS",u=>managementPerformance(u.id,q.get("month"),q.get("agencyId")));}
