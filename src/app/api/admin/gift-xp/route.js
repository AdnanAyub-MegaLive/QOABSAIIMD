import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/progression";
function error(e) { return Response.json({success:false,error:{message:e.status||e.code==="VALIDATION_ERROR"?e.message:"Unable to manage gift XP."}},{status:e.status||(e.code==="VALIDATION_ERROR"?422:500)}); }
export async function GET() {
  try { await requirePermission("rules.view"); const gifts=await prisma.uploadAsset.findMany({where:{category:{in:["GIFTS","LIVE_GIFTS"]}},select:{publicId:true,name:true,category:true,coinPrice:true,senderXp:true,receiverXp:true},orderBy:[{category:"asc"},{name:"asc"}]});return Response.json({success:true,data:jsonSafe(gifts)}); } catch(e){return error(e);}
}

