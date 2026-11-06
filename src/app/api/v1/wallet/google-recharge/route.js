import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileJson, mobileOptions } from "@/lib/mobile-api";
import { billingAccountId, creditGoogleRecharge } from "@/lib/google-recharge";
export const OPTIONS = mobileOptions;
export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const rows = await prisma.googleRechargeProduct.findMany({where:{active:true},orderBy:{coins:"asc"}});
    return mobileJson({success:true,data:{obfuscatedAccountId:billingAccountId(user.id),products:rows.map(p=>({productId:p.productId,coins:p.coins.toString()}))}});
  } catch (error) { return mobileApiError(error,"RECHARGE_CATALOG_FAILED"); }
}
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const body = await request.json().catch(()=>null);
    const data = await creditGoogleRecharge(prisma,user.id,body);
    return mobileJson({success:true,data});
  } catch (error) {
    if (error.status && error.code) return mobileJson({success:false,error:{code:error.code,message:error.message}},error.status);
    return mobileApiError(error,"RECHARGE_FAILED");
  }
}
