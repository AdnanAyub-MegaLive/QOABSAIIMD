import { prisma } from "@/lib/prisma";
import { teamRequest } from "@/lib/team-api";
import { resolveRoleTags } from "@/lib/role-tags";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
import { avatarDisplayUrl } from "@/lib/avatar-history";

const roles = ["RESELLER","OFFICIAL","BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD","MANAGER","CS","CS_LEADER"];
export async function GET(request) {
  return teamRequest(request, "/api/v1/officials", ["GET"], async () => {
    const query = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(10000, Number(query.get("page")) || 1));
    if (!Number.isInteger(page)) throw Object.assign(new Error("Invalid page."), {code:"VALIDATION_ERROR"});
    const q = (query.get("q") ?? "").trim().slice(0,100), role = query.get("role");
    if (role && !roles.includes(role)) throw Object.assign(new Error("Invalid official role."), {code:"VALIDATION_ERROR"});
    const users = await prisma.user.findMany({ where: {
      status:"ACTIVE", deletedAt:null, appRoles:{hasSome:role?[role]:roles},
      bans:{none:{target:"USER",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}},
      ...(q?{OR:[{name:{contains:q,mode:"insensitive"}},{publicId:{contains:q,mode:"insensitive"}}]}:{}),
    }, select:{id:true,publicId:true,name:true,profileImage:true,country:true,appRoles:true},
      orderBy:[{name:"asc"},{publicId:"asc"}],skip:(page-1)*20,take:21 });
    const rows=users.slice(0,20), origin=requestOrigin(request);
    const [tags,perks]=await Promise.all([resolveRoleTags(rows,origin),resolveUserPerks(rows,origin,["FRAMES"])]);
    return {page,hasMore:users.length>20,items:rows.map(u=>({publicId:u.publicId,name:u.name,country:u.country,
      profileImage:avatarDisplayUrl(u.profileImage,origin),frameUrl:perks.get(u.publicId)?.frameUrl??null,
      roles:u.appRoles.filter(r=>roles.includes(r)),roleTags:(tags.get(u.publicId)??[]).filter(t=>roles.includes(t.role))}))};
  });
}
