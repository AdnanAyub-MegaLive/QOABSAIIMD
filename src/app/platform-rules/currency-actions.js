"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { validateCurrencyPolicy } from "@/lib/currency-policy";
import { reviewCurrencyRequest } from "@/lib/currency-operations";
export async function saveCurrencyPolicy(input){
  const admin=await requirePermission("rules.manage");
  const rules=validateCurrencyPolicy(input);
  await prisma.$transaction(async tx=>{
    const row=await tx.currencyPolicy.upsert({where:{id:"GLOBAL"},create:{id:"GLOBAL",rules,version:2},update:{rules,version:{increment:1}}});
    await tx.auditLog.create({data:{adminId:admin.id,action:"CURRENCY_POLICY_UPDATED",category:"FINANCE",entityType:"CurrencyPolicy",entityId:"GLOBAL",description:`Currency rules version ${row.version}`,metadata:{rules,version:row.version}}});
  });
  revalidatePath("/platform-rules");
}
export async function reviewCurrency(input){
  const admin=await requirePermission("finance.withdrawals");
  await reviewCurrencyRequest(prisma,admin,input.id,input.action,input.note,input.hash,input.paymentVerified);
  revalidatePath("/platform-rules");
}
