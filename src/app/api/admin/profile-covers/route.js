import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
export async function GET(request) {
  try {
    await requirePermission("content.view");
    const userId = new URL(request.url).searchParams.get("userId");
    if (userId) {
      const coverId = new URL(request.url).searchParams.get("coverId");
      const cover = coverId ? await prisma.profileCoverItem.findFirst({where:{id:coverId,userId}}) : await prisma.profileCover.findUnique({ where: { userId } });
      return cover ? new Response(cover.imageData, { headers: { "Content-Type": cover.mimeType, "Cache-Control": "private, no-store" } }) : new Response(null,{status:404});
    }
    const legacy = await prisma.profileCover.findMany({ select: { mimeType: true, userId: true, status: true, revision: true, updatedAt: true, user: { select: { publicId: true, name: true } } }, orderBy: { updatedAt: "desc" }, take: 100 });
    const gallery = await prisma.profileCoverItem.findMany({select:{id:true,userId:true,mimeType:true,status:true,revision:true,updatedAt:true,user:{select:{publicId:true,name:true}}},orderBy:{updatedAt:"desc"},take:100});
    const items=[...legacy,...gallery].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,100);
    return Response.json({ success: true, data: { items } });
  } catch (e) { return Response.json({success:false,error:{message:e.status?e.message:"Unable to load covers."}},{status:e.status??500}); }
}
export async function PATCH(request) {
  try {
    const admin = await requirePermission("content.manage"); sameOrigin(request);
    const { userId, revision, action, coverId } = await jsonBody(request);
    if (typeof userId !== "string" || typeof revision !== "string" || !["APPROVE","REJECT","DELETE"].includes(action)) return Response.json({success:false},{status:422});
    await prisma.$transaction(async tx => {
      const model=coverId?tx.profileCoverItem:tx.profileCover,where={userId,revision,...(coverId?{id:coverId}:{})};
      const result = action === "DELETE" ? await model.deleteMany({where}) : await model.updateMany({where,data:{status:action==="APPROVE"?"APPROVED":"REJECTED"}});
      if (!result.count) throw Object.assign(new Error("Cover changed. Refresh before reviewing."),{status:409});
      await tx.auditLog.create({data:{adminId:admin.id,action:`PROFILE_COVER_${action}`,category:"CONTENT_MODERATION",entityType:"User",entityId:userId,description:"Profile cover moderation."}});
    });
    return Response.json({success:true});
  } catch(e) { return Response.json({success:false,error:{message:e.status?e.message:"Unable to review cover."}},{status:e.status??500}); }
}
