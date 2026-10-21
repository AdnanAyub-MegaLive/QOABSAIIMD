"use server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { ledgerData, parsePositiveCoins, walletPublicId } from "@/lib/wallet";
export async function fundReseller(publicId, amount, requestId, reason) {
  const admin = await requirePermission("finance.adjust");
  const coins = parsePositiveCoins(amount);
  if (coins > 500000000n || !/^[A-Za-z0-9-]{8,128}$/.test(requestId ?? "") || typeof reason !== "string" || !reason.trim() || reason.length > 500) throw new Error("Provide a request ID, reason and 1–500,000,000 Coins.");
  const actorId = `ADMIN:${admin.id}`, fingerprint = JSON.stringify([publicId,String(coins),reason]);
  for(let attempt=0;;attempt++)try{return await prisma.$transaction(async tx => {
    const old = await tx.resellerRechargeRequest.findUnique({where:{actorId_requestId:{actorId,requestId}}});
    if(old){if(old.fingerprint!==fingerprint)throw new Error("Request ID already used with different details.");return old.result;}
    const user = await tx.user.findFirst({where:{publicId,status:"ACTIVE",deletedAt:null,appRoles:{has:"RESELLER"}}});
    if(!user)throw new Error("Active reseller not found.");
    const changed=await tx.user.updateMany({where:{id:user.id,resellerCoinBalance:{lte:9223372036854775807n-coins}},data:{resellerCoinBalance:{increment:coins}}});
    if(!changed.count)throw new Error("Business balance limit exceeded.");
    const referenceId=walletPublicId("BIZ");
    await tx.walletTransaction.create({data:ledgerData({userId:user.id,type:"ADMIN_ADJUSTMENT",direction:"CREDIT",title:"Business wallet funded by administrator",coins,referenceId,metadata:{wallet:"BUSINESS",adminId:admin.id,reason}})});
    await tx.auditLog.create({data:{adminId:admin.id,action:"RESELLER_BUSINESS_RECHARGE",category:"FINANCE",entityType:"User",entityId:publicId,description:reason,metadata:{coins:String(coins),referenceId,businessBefore:String(user.resellerCoinBalance),businessAfter:String(user.resellerCoinBalance+coins)}}});
    const result={businessCoins:String(user.resellerCoinBalance+coins),personalCoins:String(user.coinBalance),referenceId};
    await tx.resellerRechargeRequest.create({data:{actorId,requestId,fingerprint,result}});
    return result;
  },{isolationLevel:"Serializable"});}catch(e){if(attempt>=3||!["P2002","P2034"].includes(e.code))throw e;}
}
