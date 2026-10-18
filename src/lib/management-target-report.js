import {managementRole} from './user-roles.js';

// Reporting only. Never grants salary or rewrites historical attribution.
export function targetReports(people, agencies, credits, rules) {
 const byId=new Map(people.map(p=>[p.id,p]));
 return new Map(people.map(person=>{
  const rule=rules.find(r=>r.role===(person.teamRole??managementRole(person)));
  if(!rule||!['OWN','SUBTREE'].includes(rule.scope)||!rule.salaryCurrency||BigInt(rule.targetCoins)<=0n)return [person.publicId,null];
  const included=new Set(agencies.filter(a=>{
   let id=a.bdUserId;const seen=new Set();
   while(id&&!seen.has(id)){if(id===person.id)return true;if(rule.scope==='OWN')break;seen.add(id);id=byId.get(id)?.supervisorUserId;}
   return false;
  }).map(a=>a.id));
  const progress=credits.filter(r=>included.has(r.agencyId)).reduce((sum,r)=>sum+BigInt(r.coins??0),0n);
  const target=BigInt(rule.targetCoins),achieved=progress>=target;
  return [person.publicId,{...rule,metric:'AGENCY_HOST_COIN_TOPUPS',attribution:'CURRENT_AGENCY_MEMBERSHIP',progressCoins:String(progress),remainingCoins:String(progress>=target?0n:target-progress),progressPercent:Number(progress*10000n/target)/100,achieved,projectedSalary:achieved?rule.salaryAmount:'0',salaryStatus:'ESTIMATE_NOT_A_PAYMENT'}];
 }));
}

export async function managementTargets(db,people,agencies,period){
 const policy=await db.teamPolicy.findUnique({where:{id:'GLOBAL'}});
 const hosts=agencies.length?await db.user.findMany({where:{agencyId:{in:agencies.map(a=>a.id)}},select:{id:true,agencyId:true}}):[];
 const groups=hosts.length?await db.walletTransaction.groupBy({by:['userId'],where:{userId:{in:hosts.map(h=>h.id)},type:{in:['COIN_TOP_UP','TRANSFER_RECEIVED']},direction:'CREDIT',status:'COMPLETED',createdAt:{gte:period.start,lt:period.end}},_sum:{coins:true}}):[];
 const hostAgency=new Map(hosts.map(h=>[h.id,h.agencyId]));
 return targetReports(people,agencies,groups.map(g=>({agencyId:hostAgency.get(g.userId),coins:g._sum.coins})),policy?.topUpTargets??[]);
}
