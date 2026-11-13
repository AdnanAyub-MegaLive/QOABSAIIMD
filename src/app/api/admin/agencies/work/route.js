import { reportCycle, publicCycle } from '@/lib/reporting-cycles';
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { agencyWorkReports, hierarchyWork, validateSalaryTiers, usdValue } from "@/lib/agency-work";
import { teamSelect } from "@/lib/management-team";
function failure(error) {
  if(error.code === "P2034" || error.code === "P2002") return Response.json({success:false,error:{message:"Targets changed concurrently. Reload before saving."}},{status:409});
  if(error instanceof SyntaxError) return Response.json({success:false,error:{message:"Invalid JSON request."}},{status:422});
  return Response.json({ success:false, error:{message:error.status||error.code==="VALIDATION_ERROR"?error.message:"Unable to process agency work. Check the policy and retry."} },{status:error.status??(error.code==="VALIDATION_ERROR"?422:500)});
}
export async function GET(request) {
  try {
    await requirePermission("agencies.view");
    const period=await reportCycle(prisma,'AGENCY_COMMISSION',new URL(request.url).searchParams.get('month'));
    const data=await prisma.$transaction(async tx=>{
      const agencies=await tx.agency.findMany({select:{id:true,publicId:true,name:true,bdUserId:true}});
      const people=await tx.user.findMany({where:{OR:[{appRoles:{hasSome:["MANAGER","BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD"]}},{id:{in:agencies.map(a=>a.bdUserId).filter(Boolean)}}]},select:teamSelect});
      const reports=await agencyWorkReports(tx,agencies,period);
      const total=reports.reduce((n,a)=>n+BigInt(a.work.totalDiamonds),0n),salary=reports.reduce((n,a)=>n+BigInt(a.work.salaryDiamonds),0n);
      const policy=await tx.agencySalaryPolicy.findUnique({where:{month:period.policyKey}});
      const rate=policy?.diamondsPerUsd;
      return {editableCycle:new Date()>=period.start&&new Date()<period.end,month:period.month,cycle:publicCycle(period),policy,agencies:reports.map(({id:_id,...r})=>r),hierarchy:hierarchyWork(people,reports),totalDiamonds:String(total),salaryDiamonds:String(salary),totalUsd:rate?usdValue(total,rate):null,salaryUsd:rate?usdValue(salary,rate):null,unvaluedGiftCount:reports.reduce((n,a)=>n+a.work.unvaluedGiftCount,0)};
    },{isolationLevel:"RepeatableRead"});
    return Response.json({success:true,data:JSON.parse(JSON.stringify(data,(_,v)=>typeof v==="bigint"?String(v):v))},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return failure(error);}
}
export async function PUT(request) {
  try {
    const admin=await requirePermission("agencies.edit");
    const body=await request.json(),period=await reportCycle(prisma,'AGENCY_COMMISSION',body?.month);
    if(new Date()<period.start||new Date()>=period.end)throw Object.assign(new Error("Only the current UTC+7 cycle's targets can be changed. Historical policies are preserved."),{status:422});
    let tiers;try{tiers=validateSalaryTiers(body?.tiers);}catch(error){throw Object.assign(error,{status:422});}
    await prisma.$transaction(async tx=>{
      const old=await tx.agencySalaryPolicy.findUnique({where:{month:period.policyKey}});
      if((old?.version??0)!==body.version)throw Object.assign(new Error("Targets changed. Reload before saving."),{status:409});
      await tx.agencySalaryPolicy.upsert({where:{month:period.policyKey},create:{month:period.policyKey,tiers,diamondsPerUsd:90000n},update:{tiers,version:{increment:1}}});
      await tx.auditLog.create({data:{adminId:admin.id,action:"AGENCY_SALARY_TARGETS_UPDATED",category:"FINANCE",entityType:"AgencySalaryPolicy",entityId:period.policyKey,description:"Updated monthly per-talent agency commission targets.",metadata:{tiers,diamondsPerUsd:"90000",previousVersion:old?.version??0}}});
    },{isolationLevel:"Serializable"});
    return Response.json({success:true});
  }catch(error){return failure(error);}
}
