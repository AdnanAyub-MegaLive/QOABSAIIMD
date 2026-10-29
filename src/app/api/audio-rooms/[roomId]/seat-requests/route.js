import { prisma } from '@/lib/prisma';
import { requireMobileUser,mobileJson,mobileOptions,mobileApiError } from '@/lib/mobile-api';
import { listSeatRequests } from '@/lib/audio-room-seat-requests';
export const runtime='nodejs';
export function OPTIONS(){return mobileOptions();}
export async function GET(request,{params}){
  try{
    const user=await requireMobileUser(request),{roomId}=await params,url=new URL(request.url);
    const data=await listSeatRequests(prisma,user.id,roomId,{cursor:url.searchParams.get('cursor')||undefined,limit:Number(url.searchParams.get('limit')??30)});
    return mobileJson({success:true,data});
  }catch(error){
    if(error.status)return mobileJson({success:false,error:{code:error.code,message:error.message}},error.status);
    return mobileApiError(error,'SEAT_REQUEST_LIST_FAILED');
  }
}
