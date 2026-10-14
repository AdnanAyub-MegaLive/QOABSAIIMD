import { prisma } from "./prisma.js";
import { createPublicDisplayAssetUrl } from "./upload-assets.js";
export function validateActivityRule(body) {
  const fail=()=>{throw Object.assign(new Error("Use GAME or AGENCY, a percentage from 0–100, and increasing integer levels/XP thresholds starting at level 0 / XP 0."),{status:422});};
  if(!["GAME","AGENCY"].includes(body.track)||typeof body.enabled!=="boolean"||!Number.isInteger(body.rateBps)||body.rateBps<0||body.rateBps>10000||!Array.isArray(body.levels)||!body.levels.length||body.levels.length>200)fail();
  const levels=body.levels.map(l=>{if(!l||!Number.isSafeInteger(l.level)||l.level<0||!/^\d{1,18}$/.test(String(l.threshold))||l.badgeAssetId!=null&&!/^AST-[A-Za-z0-9-]+$/.test(l.badgeAssetId))fail();return {level:l.level,threshold:String(l.threshold),badgeAssetId:l.badgeAssetId||null};}).sort((a,b)=>a.level-b.level);
  if(levels[0].level!==0||BigInt(levels[0].threshold)!==0n||levels.some((l,i)=>i&&(l.level<=levels[i-1].level||BigInt(l.threshold)<=BigInt(levels[i-1].threshold))))fail();
  return {track:body.track,enabled:body.enabled,rateBps:body.rateBps,levels};
}
export function activitySnapshot(rule, points, origin) {
  if(!rule)return {level:null,badgeUrl:null,lifetimeXp:points.toString(),nextLevel:null,nextThreshold:null,remainingXp:"0",progressPercent:0};
  const levels=rule.levels,current=levels.filter(l=>BigInt(l.threshold)<=points).at(-1),next=levels.find(l=>BigInt(l.threshold)>points);
  return {level:current?.level??0,badgeUrl:current?.badgeAssetId&&origin?createPublicDisplayAssetUrl(origin,current.badgeAssetId):null,lifetimeXp:points.toString(),nextLevel:next?.level??null,nextThreshold:next?.threshold??null,remainingXp:next?(BigInt(next.threshold)-points).toString():"0",progressPercent:next?Number((points-BigInt(current?.threshold??0))*10000n/(BigInt(next.threshold)-BigInt(current?.threshold??0)))/100:100,ruleRevision:rule.revision,earningEnabled:rule.enabled};
}
export async function activityProgress(track,subjectId,origin=null,db=prisma) {
  if (!subjectId) throw new Error("Activity progression requires a subject ID.");
  const [rule,total]=await Promise.all([db.activityLevelRule.findUnique({where:{track}}),db.activityLevelAward.aggregate({where:{track,subjectId},_sum:{xp:true}})]);
  return activitySnapshot(rule,total._sum.xp??0n,origin);
}
export async function awardActivityXp(tx,track,subjectId,sourceId,amount) {
  if(!subjectId||amount==null||BigInt(amount)<=0n)return;
  const rule=await tx.activityLevelRule.findUnique({where:{track}});
  if(!rule?.enabled)return;
  const xp=BigInt(amount)*BigInt(rule.rateBps)/10000n;
  await tx.activityLevelAward.upsert({where:{track_sourceId:{track,sourceId}},update:{},create:{track,subjectId,sourceId,amount:BigInt(amount),xp,rateBps:rule.rateBps,ruleRevision:rule.revision}});
}
