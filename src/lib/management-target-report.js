import {managementRole} from './user-roles.js';
// Personal targets use only directly assigned agency income, never descendant totals.
// Reporting only: never accrues salary or changes balances.
export function targetReports(people, agencies, rules) {
 return new Map(people.map(person=>{
  const own=agencies.filter(a=>a.bdUserId===person.id);
  const progress=own.reduce((n,a)=>n+BigInt(a.work.totalDiamonds),0n);
  const unvaluedGiftCount=own.reduce((n,a)=>n+(a.work.unvaluedGiftCount??0),0);
  const rule=rules.find(r=>r.role===(person.teamRole??managementRole(person)));
  const target=rule?.targetDiamonds&&/^\d+$/.test(String(rule.targetDiamonds))?BigInt(rule.targetDiamonds):0n;
  const configured=target>0n,achieved=configured&&unvaluedGiftCount===0&&progress>=target;
  return [person.publicId,{metric:'DIRECT_AGENCY_RECEIVED_DIAMONDS',scope:'OWN',attribution:'CURRENT_DIRECT_AGENCY_SUPERVISION',agencyCount:own.length,
   progressDiamonds:String(progress),targetDiamonds:configured?String(target):null,remainingDiamonds:configured?String(progress>=target?0n:target-progress):null,
   progressPercent:configured?Number(progress*10000n/target)/100:null,configured,unvaluedGiftCount,achieved,
   projectedSalary:configured&&rule.salaryCurrency?(achieved?rule.salaryAmount:'0'):null,salaryCurrency:rule?.salaryCurrency||null,salaryStatus:'ESTIMATE_NOT_A_PAYMENT'}];
 }));
}
export async function managementTargets(db,people,agencyReports){
 const policy=await db.teamPolicy.findUnique({where:{id:'GLOBAL'}});
 return targetReports(people,agencyReports,policy?.topUpTargets??[]);
}
