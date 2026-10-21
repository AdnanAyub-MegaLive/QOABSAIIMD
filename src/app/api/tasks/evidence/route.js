import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { metricOf } from "@/lib/task-center-config";
import { periodStart } from "@/lib/daily-tasks";
import { isRateLimited } from "@/lib/rate-limit";
export function OPTIONS(){return mobileOptions();}
export async function POST(request){
 try{
  const user=await requireMobileUser(request);
  if(isRateLimited(`task-evidence:${user.id}`,{limit:10,windowMs:60000}))return mobileJson({success:false,error:{code:"RATE_LIMITED",message:"Please wait before submitting more evidence."}},429);
  const body=await request.json(),evidence=String(body.evidence??"").trim();
  if(!evidence||evidence.length>2000)return mobileJson({success:false,error:{code:"VALIDATION_ERROR",message:"Provide evidence between 1 and 2,000 characters."}},422);
  const result=await prisma.$transaction(async tx=>{
   const row=await tx.dailyTaskInstance.findFirst({where:{id:String(body.taskId??""),userId:user.id},include:{definition:{include:{category:true}}}});
   if(!row||!row.definition.active||row.definition.deletedAt||!row.definition.category.active||metricOf(row.definition)!=="MANUAL")throw Object.assign(new Error("TASK_NOT_FOUND"),{code:"TASK_NOT_FOUND"});
   if(row.periodStart.getTime()!==periodStart(row.definition,new Date()).getTime())throw Object.assign(new Error("TASK_EXPIRED"),{code:"TASK_EXPIRED"});
   if(row.claimedAt||["APPROVED","PENDING"].includes(row.reviewStatus))return {taskId:row.id,reviewStatus:row.reviewStatus};
   await tx.dailyTaskInstance.update({where:{id:row.id},data:{evidence,reviewStatus:"PENDING",reviewReason:null}});
   return {taskId:row.id,reviewStatus:"PENDING"};
  },{isolationLevel:"Serializable"});
  return mobileJson({success:true,data:result});
 }catch(e){return mobileApiError(e,"TASK_EVIDENCE_FAILED");}
}
