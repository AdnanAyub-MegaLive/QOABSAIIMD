import { prisma } from "./prisma.js";
import { ledgerData } from "./wallet.js";
import { checkInDay, metricOf } from "./task-center-config.js";
import { measuredTaskProgress } from "./task-center-progress.js";
import { grantTaskReward, rewardDisplay } from "./task-center-rewards.js";
import { notifyAction } from "./action-notifications.js";

import { periodStart, utcDayStart } from "./task-periods.js";
export { periodStart, utcDayStart, utcWeekStart } from "./task-periods.js";
export function periodEnd(d,now){
  if(d.cadence==="BEGINNER")return null;
  const end=periodStart(d,now);if(d.cadence==="MONTHLY")end.setUTCMonth(end.getUTCMonth()+1);else end.setUTCDate(end.getUTCDate()+(d.cadence==="WEEKLY"?7:1));return end;
}
const fail=code=>{throw Object.assign(new Error(code),{code,status:code==="TASK_NOT_FOUND"?404:409});};
const rewardOf=d=>d.rewardSpec??{kind:"COINS",coins:String(d.rewardCoins)};
const duration=n=>{const m=Math.floor(n/60);return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m} min`;};
function stateOf(i){if(i.claimedAt)return "completed";if(i.state==="LOCKED")return "locked";return metricOf(i.definition)==="SIGN_IN"||i.progressValue>=i.definition.targetValue?"claim":"progress";}
export function serializeDailyTask(i){
 const d=i.definition,value=Math.min(i.progressValue,d.targetValue),state=stateOf(i),reward=i.claimResult?.reward??rewardOf(d);
 return {id:i.id,title:d.title,description:d.description??null,type:d.type,metric:metricOf(d),cadence:d.cadence,
  reward:reward.kind==="COINS"?Number(reward.coins):0,rewardDetails:reward,state,progressValue:value,targetValue:d.targetValue,
  reviewStatus:i.reviewStatus??null,reviewReason:i.reviewReason??null,requiresReview:metricOf(d)==="MANUAL",...(i.completionProgress?{completionProgress:i.completionProgress}:{}),
  ...(state==="progress"?{progress:Math.min(value/d.targetValue,1),progressLabel:d.unit==="SECONDS"?`${duration(value)} / ${duration(d.targetValue)}`:`${value} / ${d.targetValue}`}:{ }),
  ...(d.icon?{icon:d.icon}:{}),...(d.iconUrl?{iconUrl:d.iconUrl}:{})};
}
const enabled={active:true,deletedAt:null,category:{active:true}};
async function instanceFor(db,userId,d,now){return db.dailyTaskInstance.upsert({where:{userId_definitionId_periodStart:{userId,definitionId:d.id,periodStart:periodStart(d,now)}},create:{userId,definitionId:d.id,periodStart:periodStart(d,now)},update:{}});}
async function refresh(db,userId,i,now){
 if(i.claimedAt)return i;
 const d=i.definition,metric=metricOf(d);let value;
 if(metric==="COMPLETE_TASKS"){
  const tasks=await db.dailyTaskDefinition.findMany({where:{...enabled,categoryKey:d.categoryKey,cadence:d.cadence,OR:[{metric:null,type:{not:"SIGN_IN"}},{metric:{notIn:["COMPLETE_TASKS","SIGN_IN"]}}],id:{not:d.id}}});
  let done=0;for(const child of tasks){const row=await instanceFor(db,userId,child,now);const ready=await refresh(db,userId,{...row,definition:child},now);if(stateOf(ready)==="claim"||stateOf(ready)==="completed")done++;}
  const required=d.config?.requiredCount||tasks.length;
  i={...i,completionProgress:{completed:done,required}};
  value=required>0&&done>=required?d.targetValue:0;
 }else if(metric==="MANUAL")value=i.reviewStatus==="APPROVED"?d.targetValue:0;
 else value=await measuredTaskProgress(db,userId,d,periodStart(d,now),now);
 if(value===null||value===undefined)return i;
 await db.dailyTaskInstance.updateMany({where:{id:i.id,claimedAt:null},data:{progressValue:value,state:value>=d.targetValue?"CLAIM":"PROGRESS",completedAt:value>=d.targetValue?now:null}});
 return {...i,progressValue:value};
}
async function display(db,i,origin,streak,now){
 const d=i.definition;
 const reward=i.claimResult?.reward??(metricOf(d)==="SIGN_IN"?d.config?.days?.[checkInDay(streak,now).day-1]:null)??rewardOf(d);
 const result=serializeDailyTask({...i,definition:{...d,rewardSpec:reward}});
 return {...result,rewardDetails:await rewardDisplay(db,reward,origin),resetsAt:periodEnd(d,now)?.toISOString()??null};
}
export async function getDailyTasksOverview(user,now=new Date(),origin=null){
 const definitions=await prisma.dailyTaskDefinition.findMany({where:enabled,orderBy:[{sortOrder:"asc"},{id:"asc"}]});
 const categories=await prisma.dailyTaskCategory.findMany({where:{active:true},orderBy:[{sortOrder:"asc"},{key:"asc"}]});
 const streak=await prisma.dailyTaskStreak.findUnique({where:{userId:user.id}});
 const ordered=[];for(const d of definitions){const i=await instanceFor(prisma,user.id,d,now);ordered.push(await refresh(prisma,user.id,{...i,definition:d},now));}
 const payloads=await Promise.all(ordered.map(i=>display(prisma,i,origin,streak,now)));
 const signIndex=ordered.findIndex(i=>metricOf(i.definition)==="SIGN_IN"),sign=ordered[signIndex];
 const cycle=checkInDay(streak,now),days=[];
 for(let n=1;n<=7;n++)days.push({day:n,done:n<cycle.day||(n===cycle.day&&cycle.claimedToday),current:n===cycle.day,reward:await rewardDisplay(prisma,sign?.definition.config?.days?.[n-1]??(sign?rewardOf(sign.definition):{kind:"COINS",coins:"0"}),origin)});
 const daily=ordered.filter(i=>i.definition.cadence==="DAILY"),remaining=Math.max(0,periodEnd({cadence:"DAILY"},now)-now);
 const label=[Math.floor(remaining/3600000),Math.floor(remaining/60000)%60,Math.floor(remaining/1000)%60].map(v=>String(v).padStart(2,"0")).join(":");
 return {coinBalance:user.coinBalance.toString(),timezone:"UTC",today:{done:daily.filter(i=>i.claimedAt).length,total:daily.length,resetsInLabel:label},
  streak:{label:`Day ${cycle.day} check-in`,days},checkIn:sign?{...payloads[signIndex],days}:null,
  categories:categories.map(c=>({key:c.key,icon:c.icon,tasks:payloads.filter((_,n)=>ordered[n].definition.categoryKey===c.key&&!ordered[n].definition.topSupporter&&metricOf(ordered[n].definition)!=="COMPLETE_TASKS"),completionBonus:payloads.find((_,n)=>ordered[n].definition.categoryKey===c.key&&metricOf(ordered[n].definition)==="COMPLETE_TASKS")??null})),
  featured:payloads.find((_,n)=>ordered[n].definition.featured)??null,topSupporter:(()=>{const n=ordered.findIndex(i=>i.definition.topSupporter);return n<0?null:{...payloads[n],endsInLabel:payloads[n].resetsAt?`${Math.max(0,Math.ceil((new Date(payloads[n].resetsAt)-now)/86400000))}d`:null};})()};
}
// Trusted server events only. Multiple definitions may share one progress source.
export async function addDailyTaskProgress(userId,type,amount,now=new Date(),db=prisma){
 if(!Number.isSafeInteger(amount)||amount<=0)return;
 // These metrics are derived from committed, non-reversed gifts at read/claim
 // time. They never increment instances here, so do not query definitions.
 if(["SEND_GIFTS","TOP_SUPPORTER"].includes(type))return;
 const definitions=await db.dailyTaskDefinition.findMany({where:{...enabled,OR:[{metric:type},{metric:null,type}]}});
 for(const d of definitions){
  // Gift progress is recomputed from non-reversed transactions, never incremental claims.
  if(["SEND_GIFTS","TOP_SUPPORTER"].includes(type))continue;
  const i=await instanceFor(db,userId,d,now);if(i.claimedAt)continue;
  await db.dailyTaskInstance.updateMany({where:{id:i.id,claimedAt:null,progressValue:i.progressValue},data:{progressValue:Math.min(i.progressValue+amount,d.targetValue)}});
 }
}
export async function claimDailyTask(userId,taskId,expectedType=null,now=new Date()){
 for(let attempt=0;attempt<4;attempt++)try{return await prisma.$transaction(async tx=>{
  let i=await tx.dailyTaskInstance.findFirst({where:{id:String(taskId??""),userId},include:{definition:true}});
  if(!i)fail("TASK_NOT_FOUND");
  if(i.claimResult)return i.claimResult;
  if(i.claimedAt)fail("TASK_ALREADY_CLAIMED");
  const d=i.definition;if(!d.active||d.deletedAt)fail("TASK_NOT_FOUND");
  if(!(await tx.dailyTaskCategory.findUnique({where:{key:d.categoryKey}}))?.active)fail("TASK_NOT_FOUND");
  if(i.periodStart.getTime()!==periodStart(d,now).getTime())fail("TASK_EXPIRED");
  const sign=metricOf(d)==="SIGN_IN";
  // The generic claim endpoint accepts any owned task. Its stored definition,
  // never client input, selects the full sign-in/streak validation below.
  if(expectedType==="SIGN_IN"&&!sign)fail("TASK_CLAIM_ROUTE_INVALID");
  i=await refresh(tx,userId,i,now);if(stateOf(i)!=="claim")fail("TASK_NOT_READY");
  const streak=sign?await tx.dailyTaskStreak.findUnique({where:{userId}}):null,cycle=checkInDay(streak,now);
  if(sign&&cycle.claimedToday)fail("TASK_ALREADY_CLAIMED");
  const reward=(sign?d.config?.days?.[cycle.day-1]:null)??rewardOf(d);
  const claimed=await tx.dailyTaskInstance.updateMany({where:{id:i.id,claimedAt:null},data:{claimedAt:now,state:"COMPLETED",progressValue:d.targetValue,completedAt:now}});
  if(!claimed.count)fail("TASK_ALREADY_CLAIMED");
  const coins=await grantTaskReward(tx,userId,reward,i.id,now);
  const credit=await tx.user.updateMany({where:{id:userId,status:"ACTIVE",deletedAt:null,coinBalance:{lte:9223372036854775807n-coins}},data:{coinBalance:{increment:coins}}});
  if(!credit.count)fail("TASK_NOT_READY");
  const user=await tx.user.findUnique({where:{id:userId},select:{coinBalance:true}});
  await tx.walletTransaction.create({data:ledgerData({userId,type:"BONUS",direction:"CREDIT",title:`Task: ${d.title}`,coins,referenceId:i.id,metadata:{source:"DAILY_TASK",taskType:d.type,metric:metricOf(d),reward}})});
  await notifyAction(tx,{userId,key:`task:${i.id}`,type:"REWARD",title:"Task reward received",body:reward.kind==="COINS"?`${coins} Coins credited for ${d.title}.`:`${reward.kind} reward received for ${d.title}.`,action:{screen:"TASKS",taskId:i.id}});
  if(sign)await tx.dailyTaskStreak.upsert({where:{userId},create:{userId,currentStreak:cycle.count,lastSignInDate:utcDayStart(now)},update:{currentStreak:cycle.count,lastSignInDate:utcDayStart(now)}});
  const result={coinBalance:user.coinBalance.toString(),reward,task:serializeDailyTask({...i,claimedAt:now,progressValue:d.targetValue,definition:{...d,rewardSpec:reward}}),...(sign?{streak:{label:`Day ${cycle.day} check-in`,days:Array.from({length:7},(_,n)=>({day:n+1,done:n<cycle.day,current:n+1===cycle.day}))}}:{})};
  await tx.dailyTaskInstance.update({where:{id:i.id},data:{claimResult:result}});return result;
 },{isolationLevel:"Serializable",timeout:15000});}catch(e){if(attempt<3&&["P2034","P2002"].includes(e.code))continue;throw e;}
}
