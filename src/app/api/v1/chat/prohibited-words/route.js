import { prisma } from "@/lib/prisma";
import { requireMobileUser,mobileJson,mobileApiError,mobileOptions } from "@/lib/mobile-api";
export function OPTIONS(){return mobileOptions();}
export async function GET(request){
  try{
    await requireMobileUser(request);
    const policy=await prisma.chatWordPolicy.findUnique({where:{id:"GLOBAL"}});
    const response=await mobileJson({words:policy?.words??[],revision:policy?.revision??0});
    response.headers.set("Cache-Control","private, no-store");
    return response;
  }catch(error){return mobileApiError(error,"CHAT_POLICY_FAILED");}
}
