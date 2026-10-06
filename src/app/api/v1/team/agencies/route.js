import { teamRequest } from "@/lib/team-api";
import { managementAgencies,assignManagementAgency } from "@/lib/management-business";
import { v1Options } from "@/lib/mobile-v1";
export function OPTIONS(r){return v1Options(r,"GET, POST, OPTIONS");}
export function GET(r){return teamRequest(r,"/api/v1/team/agencies","GET, POST, OPTIONS",u=>managementAgencies(u.id));}
export function POST(r){return teamRequest(r,"/api/v1/team/agencies","GET, POST, OPTIONS",async u=>assignManagementAgency(u.id,(await r.json()).agencyId));}
