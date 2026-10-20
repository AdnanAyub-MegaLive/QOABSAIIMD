import { prisma } from "./prisma.js";
import { createPublicDisplayAssetUrl } from "./upload-assets.js";
import { activityMediaOrigin } from "./activity-event-media.js";
import { levelTagBackgrounds, tagBackground, levelMediaOrigin } from './level-tag-backgrounds.js';
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
  return {badgeAssetId:current?.badgeAssetId??null,level:current?.level??0,badgeUrl:current?.badgeAssetId&&origin?createPublicDisplayAssetUrl(origin,current.badgeAssetId):null,lifetimeXp:points.toString(),nextLevel:next?.level??null,nextThreshold:next?.threshold??null,remainingXp:next?(BigInt(next.threshold)-points).toString():"0",progressPercent:next?Number((points-BigInt(current?.threshold??0))*10000n/(BigInt(next.threshold)-BigInt(current?.threshold??0)))/100:100,ruleRevision:rule.revision,earningEnabled:rule.enabled};
}
export async function activityProgress(track,subjectId,origin=null,db=prisma) {
  origin = levelMediaOrigin(origin);
  if (!subjectId) throw new Error("Activity progression requires a subject ID.");
  const [rule,total]=await Promise.all([db.activityLevelRule.findUnique({where:{track}}),db.activityLevelAward.aggregate({where:{track,subjectId},_sum:{xp:true}})]);
  const snapshot=activitySnapshot(rule,total._sum.xp??0n,origin);
  return {...snapshot,...tagBackground(await levelTagBackgrounds(db,origin,[{track,level:snapshot.level}]),track,snapshot.level)};
}
export async function awardActivityXp(tx,track,subjectId,sourceId,amount) {
  if(!subjectId||amount==null||BigInt(amount)<=0n)return;
  const rule=await tx.activityLevelRule.findUnique({where:{track}});
  if(!rule?.enabled)return;
  const xp=BigInt(amount)*BigInt(rule.rateBps)/10000n;
  const inserted = await tx.activityLevelAward.createMany({skipDuplicates:true,data:[{track,subjectId,sourceId,amount:BigInt(amount),xp,rateBps:rule.rateBps,ruleRevision:rule.revision}]});
  if (inserted.count) await queueActivityProgress(tx,track,subjectId,sourceId);
}

// Persist alongside the award; the existing outbox publishes only after commit.
// Agency financial progression is private to its owner, never a room broadcast.
export async function queueActivityProgress(tx, track, subjectId, sourceId) {
  const [snapshot, revision, owner] = await Promise.all([
    activityProgress(track,subjectId,activityMediaOrigin(),tx),
    tx.activityLevelAward.count({where:{track,subjectId}}),
    track === "GAME" ? tx.user.findUnique({where:{id:subjectId},select:{publicId:true}})
      : tx.agency.findUnique({where:{id:subjectId},select:{publicId:true,owner:{select:{publicId:true}}}}),
  ]);
  const publicId = track === "GAME" ? owner?.publicId : owner?.owner?.publicId;
  if (!publicId) return;
  await tx.realtimeOutbox.create({data:{channel:`user:${publicId}`,event:"activity-progression:updated",payload:{success:true,data:{track,subjectId:owner.publicId,sourceId,revision,...snapshot}}}});
}
