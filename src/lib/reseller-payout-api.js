import sharp from "sharp";
import { prisma } from "./prisma.js";
import { requireMobileUser, mobileJson, mobileApiError } from "./mobile-api.js";
import { requirePermission } from "./portal-admin.js";
import { isRateLimited } from "./rate-limit.js";
import { readAvatarFile } from "./avatar-upload.js";
import { payoutAccess,payoutDto,payoutSelect,payoutFail,escrowQuote,createEscrow,actOnPayout,uploadPayoutProof } from "./reseller-payouts.js";

async function actorFor(request,admin) {
 const user=admin?await requirePermission("finance.withdrawals"):await requireMobileUser(request);
 if(isRateLimited(`escrow:${admin?"admin":"user"}:${user.id}`,{limit:request.method==="GET"?120:20,windowMs:60000}))payoutFail("RATE_LIMITED","Try again in a minute.",429);
 return {id:user.id,admin};
}
export function payoutError(e) {
 if(!e.status)return mobileApiError(e,"PAYOUT_FAILED");
 return Response.json({success:false,error:{code:e.code??"PAYOUT_FAILED",message:e.status?e.message:"Unable to process payout. Try again or contact support."}},{status:e.status??500,headers:{"Cache-Control":"no-store"}});
}
export async function payoutCollection(request,admin=false) {
 try {
  const actor=await actorFor(request,admin);
  if(request.method==="POST") {
   if(admin)payoutFail("FORBIDDEN","Use the mobile payout flow.",403);
   const input=await request.json();
   if(input.action==="QUOTE")return mobileJson({success:true,data:await escrowQuote(prisma,actor.id,input)});
   const id=await createEscrow(prisma,actor.id,input,request.headers.get("Idempotency-Key"));
   return mobileJson({success:true,data:await payoutAccess(prisma,id,actor)},201);
  }
  const url=new URL(request.url),view=url.searchParams.get("view")??"sent",tab=url.searchParams.get("tab")??"PENDING",cursor=url.searchParams.get("cursor");
  const states={PENDING:["PENDING","AWAITING_HOST","SUPPORT_REVIEW"],COMPLETED:["COMPLETED"],CANCELLED:["CANCELLED"]};
  if(!states[tab]||!["sent","received"].includes(view))payoutFail("VALIDATION_ERROR","Invalid tab or view.",422);
  const scope=admin?{}:view==="received"?{resellerId:actor.id}:{senderId:actor.id};
  const where={...scope,status:{in:states[tab]}};
  if(cursor&&!await prisma.resellerPayout.findFirst({where:{...where,id:cursor},select:{id:true}}))payoutFail("VALIDATION_ERROR","Invalid cursor.",422);
  const rows=await prisma.resellerPayout.findMany({where,select:payoutSelect,orderBy:[{createdAt:"desc"},{id:"desc"}],take:21,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const counts=Object.fromEntries(await Promise.all(Object.entries(states).map(async([key,status])=>[key,await prisma.resellerPayout.count({where:{...scope,status:{in:status}}})])));
  return mobileJson({success:true,data:{items:rows.slice(0,20).map(r=>payoutDto(r,admin)),nextCursor:rows.length>20?rows[19].id:null,counts}});
 }catch(e){return payoutError(e);}
}
export async function payoutDetail(request,params,admin=false) {
 try {
  const actor=await actorFor(request,admin),{id}=await params;
  if(request.method==="PATCH")await actOnPayout(prisma,id,actor,await request.json());
  return mobileJson({success:true,data:await payoutAccess(prisma,id,actor,true)});
 }catch(e){return payoutError(e);}
}
export async function payoutProof(request,params,admin=false) {
 try {
  const actor=await actorFor(request,admin),{id}=await params;
  const access=await payoutAccess(prisma,id,actor);
  if(request.method==="POST") {
   if(admin)payoutFail("FORBIDDEN","Only the assigned reseller can upload proof.",403);
   const file=await readAvatarFile(request,5*1024*1024,["image"]);
   if(!["image/png","image/jpeg"].includes(file.type))payoutFail("VALIDATION_ERROR","Proof must be PNG or JPEG.",422);
   let bytes;
   try {
    const image=sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:25000000,failOn:"warning"});
    const metadata=await image.metadata();
    if(metadata.format!==(file.type==="image/png"?"png":"jpeg")||(metadata.pages??1)>1)throw Error();
    bytes=await image.rotate().resize({width:2400,height:2400,fit:"inside",withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
    if(bytes.length>5*1024*1024)throw Error();
   }catch{payoutFail("VALIDATION_ERROR","Invalid or oversized image content.",422);}
   await uploadPayoutProof(prisma,id,actor,bytes,"image/jpeg");
   return mobileJson({success:true,data:await payoutAccess(prisma,id,actor)});
  }
  if(!admin&&!access.proofSubmittedAt) {
   const owner=await prisma.resellerPayout.findUnique({where:{id},select:{resellerId:true}});
   if(owner.resellerId!==actor.id)payoutFail("NOT_FOUND","Submitted proof not found.",404);
  }
  const proof=await prisma.resellerPayout.findFirst({where:{id,...(admin?{}:{OR:[{senderId:actor.id,proofSubmittedAt:{not:null}},{resellerId:actor.id}]})},select:{proofData:true,proofMimeType:true}});
  if(!proof?.proofData)payoutFail("NOT_FOUND","Proof not found.",404);
  await prisma.auditLog.create({data:{action:"RESELLER_PAYOUT_PROOF_VIEWED",category:"FINANCE",entityType:"ResellerPayout",entityId:id,description:"Private proof accessed",metadata:{actorId:actor.id,admin}}});
  return new Response(proof.proofData,{headers:{"Content-Type":proof.proofMimeType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":"inline; filename=payment-proof.jpg"}});
 }catch(e){return payoutError(e);}
}
