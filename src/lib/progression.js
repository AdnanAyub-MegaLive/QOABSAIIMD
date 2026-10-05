import { prisma } from "./prisma.js";
import { createPublicDisplayAssetUrl } from "./upload-assets.js";
export const TRACKS = ["USER", "CHARM"];
const MAX = 9223372036854775807n;
export const jsonSafe = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v));
export function progressionError(message) { return Object.assign(new Error(message), { code: "VALIDATION_ERROR" }); }
export function unsigned(value) { if (!/^\d+$/.test(String(value))) throw progressionError("Amounts must be non-negative integer strings."); const n = BigInt(value); if (n > MAX) throw progressionError("Amount exceeds supported range."); return n; }

export function validateProgressionConfig(input) {
  if (typeof input.enabled !== "boolean" || !Array.isArray(input.levels) || !Array.isArray(input.rules) || input.levels.length > 1000 || input.rules.length > 32) throw progressionError("Invalid progression configuration.");
  const levels = input.levels.map(l => {
    if (!TRACKS.includes(l.track) || !Number.isSafeInteger(l.level) || l.level < 0 || !Array.isArray(l.benefits) || l.benefits.length > 20 || l.benefits.some(b => typeof b !== "string" || b.length > 200)) throw progressionError("Invalid level or display benefits.");
    if (l.badgeAssetId != null && (typeof l.badgeAssetId !== "string" || !/^AST-[A-Za-z0-9-]+$/.test(l.badgeAssetId))) throw progressionError("Choose an uploaded badge public ID.");
    return { track: l.track, level: l.level, thresholdPoints: unsigned(l.thresholdPoints), badgeAssetId: l.badgeAssetId || null, benefits: l.benefits };
  });
  for (const track of TRACKS) {
    const rows = levels.filter(l => l.track === track).sort((a,b) => a.level-b.level);
    if (!rows.length || rows[0].level !== 0 || rows[0].thresholdPoints !== 0n) throw progressionError("Each track needs a level 0, zero-point baseline.");
    if (rows.some((l,i) => i && (l.level <= rows[i-1].level || l.thresholdPoints <= rows[i-1].thresholdPoints))) throw progressionError("Levels and thresholds must strictly increase.");
  }
  const keys = new Set();
  const rules = input.rules.map(r => {
    const key = `${r.track}:${r.source}:${r.recipientType}`;
    if (!TRACKS.includes(r.track) || !["PAID","BACKPACK","LUCKY","BLIND_BOX"].includes(r.source) || !["ANY","HOST","NORMAL_USER"].includes(r.recipientType) || !["COST","CREDIT","REVEALED","REWARD"].includes(r.basis) || typeof r.allowSelf !== "boolean" || keys.has(key)) throw progressionError("Invalid or duplicate earning rule.");
    if (r.track === "USER" && r.recipientType !== "ANY" || r.track === "CHARM" && r.recipientType === "ANY") throw progressionError("User rules use ANY; Charm rules must specify HOST or NORMAL_USER.");
    if (r.basis === "REVEALED" && r.source !== "BLIND_BOX" || r.basis === "REWARD" && r.source !== "LUCKY") throw progressionError("This earning basis does not apply to the source.");
    keys.add(key); const numerator = unsigned(r.numerator), denominator = unsigned(r.denominator);
    if (!denominator || typeof r.description !== "string" || r.description.length > 500) throw progressionError("Provide a positive denominator and a display description.");
    return { track:r.track, source:r.source, recipientType:r.recipientType, basis:r.basis, allowSelf:r.allowSelf, numerator:numerator.toString(), denominator:denominator.toString(), description:r.description };
  });
  if (input.enabled && !rules.length) throw progressionError("Approve earning rules before enabling progression.");
  return { enabled: input.enabled, levels, rules };
}

export function levelSnapshot(progress, levels, origin) {
  const points = BigInt(progress.lifetimePoints), rows = levels.filter(l => l.track === progress.track).sort((a,b) => a.level-b.level);
  const current = rows.filter(l => l.thresholdPoints <= points).at(-1) ?? { level:0, thresholdPoints:0n, benefits:[] };
  const next = rows.find(l => l.thresholdPoints > points);
  const percent = next ? Number((points-current.thresholdPoints)*10000n/(next.thresholdPoints-current.thresholdPoints))/100 : 100;
  return { type:progress.track, configurationVersion:progress.configurationVersion, revision:progress.revision, level:current.level, lifetimePoints:points.toString(), currentThreshold:current.thresholdPoints.toString(), nextLevel:next?.level ?? null, nextThreshold:next?.thresholdPoints.toString() ?? null, remainingPoints:next ? (next.thresholdPoints-points).toString() : "0", progressPercent:percent, badgeUrl:current.badgeAssetId && origin ? createPublicDisplayAssetUrl(origin,current.badgeAssetId) : null, benefits:current.benefits ?? [] };
}
export async function currentConfiguration(db=prisma) { return db.progressionConfiguration.findFirst({ where:{active:true}, include:{levels:true} }); }
export async function progressionSnapshots(userId, origin, db=prisma) {
  const [active, rows] = await Promise.all([currentConfiguration(db), db.userProgress.findMany({where:{userId},include:{configuration:{include:{levels:true}}}})]);
  return TRACKS.map(track => { const row=rows.find(r=>r.track===track); const config=row?.configuration??active; return levelSnapshot(row??{track,configurationVersion:config?.version??0,revision:0,lifetimePoints:0n}, config?.levels??[], origin); });
}
export async function appendOutbox(tx,channel,event,data) {
  const row=await tx.realtimeOutbox.create({data:{channel,event,payload:jsonSafe({success:true,data})}});
  return row.id;
}
export async function awardGiftProgress(tx, {sender,recipient,gift,source,gross,credit,revealed=0n,reward=0n,recipientType,origin}) {
  const active=await currentConfiguration(tx);
  if (!active?.enabled) return null;
  let senderSnapshot=null;
  for(const [track,user] of [["USER",sender],["CHARM",recipient]]) {
    if(!user) continue; // Talent-only recipients require an explicit account mapping; never guess it.
    let row=await tx.userProgress.findUnique({where:{userId_track:{userId:user.id,track}},include:{configuration:{include:{levels:true}}}});
    const config=row?.configuration??active;
    const rule=config.rules.find(r=>r.track===track&&r.source===source&&r.recipientType===(track==="USER"?"ANY":recipientType));
    if(!config.enabled || !rule || (recipient?.id===sender.id&&!rule.allowSelf)) continue;
    const amount={COST:gross,CREDIT:credit,REVEALED:revealed,REWARD:reward}[rule.basis];
    const points=amount*BigInt(rule.numerator)/BigInt(rule.denominator);
    const sourceType=track==="USER"?"GIFT_SENT":"GIFT_RECEIVED";
    const key={userId:user.id,track,sourceType,sourceId:gift.id,sourceLineId:gift.id};
    if(await tx.progressLedger.findUnique({where:{userId_track_sourceType_sourceId_sourceLineId:key}})) continue;
    if(!row) row=await tx.userProgress.create({data:{userId:user.id,track,configurationVersion:config.version}});
    const previousLevel=row.currentLevel, total=row.lifetimePoints+points;
    if(total>MAX) throw progressionError("Progression total exceeds supported range.");
    const updated=levelSnapshot({...row,lifetimePoints:total,revision:row.revision+1},config.levels,origin);
    await tx.progressLedger.create({data:{...key,deltaPoints:points,ruleVersion:config.version,eligibleAmount:amount,numerator:BigInt(rule.numerator),denominator:BigInt(rule.denominator),basis:rule.basis}});
    await tx.userProgress.update({where:{userId_track:{userId:user.id,track}},data:{lifetimePoints:total,currentLevel:updated.level,revision:{increment:1}}});
    const snapshot={...updated,previousLevel,levelsGained:config.levels.filter(l=>l.track===track&&l.level>previousLevel&&l.level<=updated.level).map(l=>l.level).sort((a,b)=>a-b)};
    await appendOutbox(tx,`user:${user.publicId}`,"progression:updated",{...snapshot,track,userId:user.publicId,sourceTransactionId:gift.id});
    if(track==="USER") senderSnapshot=snapshot;
  }
  return senderSnapshot;
}

export async function publicProgression(users,origin,db=prisma) {
  const rows=await db.userProgress.findMany({where:{userId:{in:users.map(u=>u.id).filter(Boolean)}},include:{configuration:{include:{levels:true}}}});
  return new Map(users.map(user=>{
    const tracks=rows.filter(r=>r.userId===user.id).map(r=>levelSnapshot(r,r.configuration.levels,origin));
    const u=tracks.find(t=>t.type==="USER"),c=tracks.find(t=>t.type==="CHARM");
    return [user.publicId,{level:u?.level??0,userLevel:u?.level??0,charmLevel:c?.level??0,anchorLevel:c?.level??0,userLevelBadgeUrl:u?.badgeUrl??null,charmLevelBadgeUrl:c?.badgeUrl??null}];
  }));
}
