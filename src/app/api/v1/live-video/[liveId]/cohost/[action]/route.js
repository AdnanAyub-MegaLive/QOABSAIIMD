import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { coHostAction } from "@/lib/video-cohost";
export function OPTIONS(){return mobileOptions()}
export async function POST(request,{params}) {
  try {
    const user=await requireMobileUser(request),{liveId,action}=await params;
    const body=await request.json().catch(()=>({}));
    return mobileJson({success:true,data:await coHostAction(prisma,user,liveId,String(action||"").toLowerCase(),body,requestOrigin(request))});
  } catch(e){return mobileApiError(e,"LIVE_COHOST_UPDATE_FAILED")}
}
