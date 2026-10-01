import { prisma } from "../../../../lib/prisma";
import { isRateLimited } from "../../../../lib/rate-limit";

export const dynamic="force-dynamic";

const corsHeaders={
  "Access-Control-Allow-Origin":process.env.MOBILE_APP_ORIGIN||"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization",
  "Cache-Control":"no-store, max-age=0",
};
const json=(body,status=200)=>Response.json(body,{status,headers:corsHeaders});

export function OPTIONS(){
  return new Response(null,{status:204,headers:corsHeaders});
}

function clientIp(request){
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ||request.headers.get("x-real-ip")?.trim()
    ||"unknown";
}

export async function GET(request){
  const ip=clientIp(request);
  if(isRateLimited(`check-phone:${ip}`,{limit:10,windowMs:60_000})){
    return json({success:false,error:{code:"RATE_LIMITED",message:"Too many requests. Try again shortly."}},429);
  }

  const phone=new URL(request.url).searchParams.get("phone")?.trim().replace(/[\s().-]/g,"")??"";
  if(!phone){
    return json({success:false,error:{code:"VALIDATION_ERROR",message:"phone is required."}},422);
  }

  try{
    const user=await prisma.user.findUnique({
      where:{phone},
      select:{deletedAt:true},
    });
    const exists=Boolean(user&&!user.deletedAt);
    return json({success:true,data:{exists}});
  }catch{
    return json({success:false,error:{code:"CHECK_FAILED",message:"Unable to check this phone number right now."}},500);
  }
}
