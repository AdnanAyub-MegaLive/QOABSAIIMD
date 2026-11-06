import { scheduleRevision } from '@/lib/host-salary';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { sameOrigin, jsonBody } from '@/lib/game-control/http';
import { moduleCycle } from '@/lib/reporting-cycles';

export async function POST(request) {
  try {
    sameOrigin(request);
    const admin=await requirePermission('rules.currency');
    const {tiers,noticeEnabled,revision}=await jsonBody(request);
    if(typeof noticeEnabled!=='boolean' || !Array.isArray(tiers) || tiers.length!==20 ||
      tiers.some((t,i)=>t.level!==i+1 || ![t.target,t.percent,t.reward,t.vip,t.days].every(Number.isSafeInteger) ||
        t.target<1 || (i>0 && t.target<=tiers[i-1].target) || t.percent<0 || t.percent>100 ||
        t.reward<0 || t.vip<0 || t.vip>5 || t.days<0 || t.days>365 || Boolean(t.vip)!==Boolean(t.days)))
      return Response.json({error:'Check target order, percentages and rewards.'},{status:422});
    await prisma.$transaction(async tx=>{
      const period=await moduleCycle(tx,'HOST_SALARY');
      const latest=await tx.hostSalarySchedule.findFirstOrThrow({orderBy:{effectiveFrom:'desc'}});
      const control=await tx.hostSalaryControl.findUniqueOrThrow({where:{id:'global'}});
      if(revision!==scheduleRevision(latest,control.noticeEnabled))throw Object.assign(new Error('Reload the schedule and try again.'),{status:409});
      await tx.hostSalaryControl.update({where:{id:'global'},data:{noticeEnabled}});
      await tx.hostSalarySchedule.upsert({where:{effectiveFrom:period.end},create:{effectiveFrom:period.end,tiers},update:{tiers}});
      await tx.auditLog.create({data:{adminId:admin.id,category:'FINANCE',action:'HOST_SALARY_POLICY_UPDATED',entityType:'HostSalarySchedule',entityId:period.key,description:'Updated host notice and next-cycle salary schedule.',metadata:{noticeEnabled,tiers,effectiveFrom:period.end.toISOString()}}});
    },{isolationLevel:'Serializable'});
    return Response.json({success:true});
  }catch(e){return Response.json({error:e.status?e.message:'Unable to save salary schedule.'},{status:e.status??500});}
}
