import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { previewGiftRefund, refundGift } from "@/lib/gift-refunds";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/progression";
const reply=data=>Response.json({success:true,data:jsonSafe(data)},{headers:{"Cache-Control":"no-store"}});
const failure=e=>Response.json({success:false,error:{message:e.status?e.message:"Unable to process gift refund."}},{status:e.status??500});
export async function GET(request){
  try{
    await requirePermission("finance.view");
    const id=new URL(request.url).searchParams.get("giftId");
    if(id)return reply(await previewGiftRefund(id));
    const params=new URL(request.url).searchParams;
    const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page')))||1));
    const [items,total]=await prisma.$transaction([
      prisma.giftRefund.findMany({orderBy:[{createdAt:'desc'},{giftId:'desc'}],skip:(page-1)*50,take:50}),
      prisma.giftRefund.count(),
    ]);
    return reply({items,total,page,pageSize:50});
  }catch(e){return failure(e);}
}
export async function POST(request){
  try{
    const admin=await requirePermission("finance.refunds");sameOrigin(request);
    const body=await jsonBody(request);
    if(typeof body.giftId!=="string"||!body.giftId||typeof body.confirmation!=="string")throw Object.assign(new Error("Preview a gift before confirming its refund."),{status:422});
    return reply(await refundGift({giftId:body.giftId,confirmation:body.confirmation,reason:body.reason,adminId:admin.id,origin:new URL(request.url).origin}));
  }catch(e){return failure(e);}
}
