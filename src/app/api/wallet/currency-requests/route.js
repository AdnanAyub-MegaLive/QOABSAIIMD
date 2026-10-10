import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { createCurrencyRequest, currencyRequestDto, updateOwnCurrencyRequest } from "@/lib/currency-operations";
import { isRateLimited } from "@/lib/rate-limit";
export const OPTIONS=mobileOptions;
export async function PATCH(request){try{
  const user=await requireMobileUser(request),body=await request.json();
  return mobileJson({success:true,data:await updateOwnCurrencyRequest(prisma,user.id,String(body.id??""),body.action)});
}catch(e){return mobileApiError(e,"CURRENCY_REQUEST_FAILED");}}
export async function GET(request){try{
  const user=await requireMobileUser(request);
  const url=new URL(request.url),cursor=url.searchParams.get("cursor");
  const limit=Math.min(50,Math.max(1,Number(url.searchParams.get("limit")??20)||20));
  if(!Number.isInteger(limit))throw Object.assign(new Error("Invalid limit."),{code:"VALIDATION_ERROR"});
  const where={OR:[{userId:user.id},{recipientPublicId:user.publicId}]};
  if(cursor&&!await prisma.currencyRequest.findFirst({where:{...where,id:cursor},select:{id:true}}))throw Object.assign(new Error("Invalid cursor."),{code:"VALIDATION_ERROR"});
  const rows=await prisma.currencyRequest.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const page=rows.slice(0,limit);
  return mobileJson({success:true,data:{requests:page.map(currencyRequestDto),nextCursor:rows.length>limit?page.at(-1).id:null}});
}catch(e){return mobileApiError(e,"CURRENCY_REQUEST_FAILED");}}
export async function POST(request){try{
  const user=await requireMobileUser(request);
  if(isRateLimited(`currency-request:${user.id}`,{limit:10,windowMs:60000}))return mobileJson({success:false,error:{code:"RATE_LIMITED",message:"Try again in a minute."}},429);
  return mobileJson({success:true,data:await createCurrencyRequest(prisma,user.id,await request.json(),request.headers.get("Idempotency-Key"))},201);
}catch(e){return mobileApiError(e,"CURRENCY_REQUEST_FAILED");}}
