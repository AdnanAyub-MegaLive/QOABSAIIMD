import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { requireVideoAccess } from "@/lib/video-access";
import { requestOrigin } from "@/lib/user-perks";
import { coHostRead } from "@/lib/video-cohost";
export function OPTIONS(){return mobileOptions()}
export async function GET(request,{params}) {
  try {
    const user=await requireMobileUser(request),{liveId}=await params;
    const live=await prisma.videoLiveSession.findUnique({where:{publicId:decodeURIComponent(liveId)}});
    await requireVideoAccess(prisma,live,user.id);
    return mobileJson({success:true,data:await coHostRead(prisma,user,live,requestOrigin(request))});
  } catch(e){return mobileApiError(e,"LIVE_COHOST_READ_FAILED")}
}
