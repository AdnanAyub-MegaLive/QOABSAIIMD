import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { pkSideSupporters } from "@/lib/video-pk";
import { requireVideoAccess, videoError } from "@/lib/video-access";
export function OPTIONS(){return mobileOptions()}
export async function GET(request,{params}) {
  try {
    const user=await requireMobileUser(request),{liveId}=await params;
    const live=await prisma.videoLiveSession.findUnique({where:{publicId:decodeURIComponent(liveId)}});
    await requireVideoAccess(prisma,live,user.id);
    const pk=await prisma.videoLivePkSession.findFirst({where:{status:"LIVE",OR:[{leftSessionId:live.id},{rightSessionId:live.id}]},include:{leftSession:true,rightSession:true}});
    if(!pk)throw videoError("PK_NOT_FOUND","No live PK.",404);
    const limit=Math.min(100,Math.max(1,Number(new URL(request.url).searchParams.get("limit"))||50));
    return mobileJson({success:true,data:{pkId:pk.id,sides:await pkSideSupporters(prisma,pk,requestOrigin(request),limit)}});
  } catch(e){return mobileApiError(e,"LIVE_PK_SUPPORTERS_FAILED")}
}
