// Explicit one-time admin operation requested for the current weekly event launch.
// Dry-run by default. Never alters closed rounds or historical policies.
import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});
const {prisma}=await import('../src/lib/prisma.js');
const {configuredRankingWindow}=await import('../src/lib/events/ranking-contract.js');
const {rewardInput}=await import('../src/lib/events/ranking-reward-rules.js');
const {validateRewardAssets}=await import('../src/lib/events/ranking-rewards.js');
const apply=process.argv.includes('--apply');
try{
 const admin=await prisma.eventUser.findFirst({where:{active:true,role:'SUPER_ADMIN'},orderBy:{id:'asc'}});
 if(!admin)throw Error('Active Events Super Admin required.');
 for(const track of ['wealth','charm','agency','cp','weekly-star','game']){
  const slug=`ranking-${track}`;
  await prisma.$transaction(async tx=>{
   const event=await tx.event.findUnique({where:{slug}});
   if(event?.status!=='PUBLISHED')throw Error(`${slug} is not published.`);
   const window=await configuredRankingWindow(tx,track,'week');
   if(window.end<=new Date())throw Error('Week closed; rerun with the current week.');
   const existing=await tx.rankingRewardRound.findUnique({where:{eventSlug_period_startsAt:{eventSlug:slug,period:'week',startsAt:window.start}}});
   if(existing)throw Error(`${slug} already has a frozen round; review before changing.`);
   const latest=await tx.rankingRewardPolicy.findFirst({where:{eventSlug:slug,period:'week'},orderBy:[{createdAt:'desc'},{id:'desc'}]});
   const rewards=track==='game'?[5,3,2].map((coinRateBps,i)=>({rank:i+1,coins:'0',diamonds:'0',props:[],vip:null,coinRateBps})):latest?.rewards;
   if(!rewards?.length)throw Error(`${slug}: configure prizes first.`);
   const data=rewardInput({track,period:'week',enabled:true,rewards});data.effectiveFrom=window.start;
   await validateRewardAssets(tx,data.rewards);
   const current=await tx.rankingRewardPolicy.findFirst({where:{eventSlug:slug,period:'week',effectiveFrom:window.start},orderBy:[{createdAt:'desc'},{id:'desc'}]});
   if(current?.enabled&&JSON.stringify(current.rewards)===JSON.stringify(data.rewards)){console.log(`${slug}: current week already configured`);return;}
   console.log(JSON.stringify({slug,apply,startsAt:window.start,endsAt:window.end,rewards:data.rewards}));
   if(!apply)return;
   const policy=await tx.rankingRewardPolicy.create({data:{...data,createdById:admin.id}});
   await tx.eventAuditLog.create({data:{userId:admin.id,eventId:event.id,action:'RANKING_REWARDS_CONFIGURED',metadata:{policyId:policy.id,sourcePolicyId:latest?.id??null,reason:'Owner requested activation for the current open week',...data,effectiveFrom:window.start.toISOString()}}});
  },{isolationLevel:'Serializable',timeout:15000});
 }
}finally{await prisma.$disconnect();}
