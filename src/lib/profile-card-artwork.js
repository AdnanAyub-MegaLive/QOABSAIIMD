import {createPublicDisplayAssetUrl} from "./upload-assets.js";
import {activityProgress} from "./activity-levels.js";
import {profileAgency} from "./profile-agency.js";
import {agencyLogoUrl} from "./agency-logo.js";
export const cardAssetFields = ["backgroundAssetId", "badgeAssetId", "top1MedalAssetId", "top2MedalAssetId", "top3MedalAssetId"];
export const cardBackgroundTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/svga", "video/mp4"];
export const cardMedalTypes = ["image/png", "image/webp", "image/gif", "application/svga"];
// Previously configured JPEG badges remain displayable, although new medals
// must use the formats above (normally with transparency).
const readableMedalTypes = [...cardMedalTypes, "image/jpeg"];
export function normalizeCardRanges(ranges) {
 return ranges.map(r => r.track === "SUPPORTER" ? { ...r, top1MedalAssetId: Object.hasOwn(r,"top1MedalAssetId") ? r.top1MedalAssetId : r.badgeAssetId ?? null, top2MedalAssetId:r.top2MedalAssetId??null,top3MedalAssetId:r.top3MedalAssetId??null,badgeAssetId:null } : r);
}
export function validateCardRanges(input){
 const fail=()=>{throw Object.assign(new Error("Use non-overlapping level ranges and uploaded asset IDs."),{status:422});};
 if(!Array.isArray(input)||input.length>100)fail();
 const rows=input.map(r=>{if(!r||!["SUPPORTER","AGENCY"].includes(r.track)||!Number.isSafeInteger(r.min)||r.min<0||r.max!==null&&(!Number.isSafeInteger(r.max)||r.max<r.min))fail();for(const k of cardAssetFields)if(r[k]!=null&&!/^AST-[A-Za-z0-9-]+$/.test(r[k]))fail();const n=normalizeCardRanges([r])[0];return {track:r.track,min:r.min,max:r.max,backgroundAssetId:r.backgroundAssetId||null,badgeAssetId:r.track==="AGENCY"?r.badgeAssetId||null:null,...(r.track==="SUPPORTER"?{top1MedalAssetId:n.top1MedalAssetId||null,top2MedalAssetId:n.top2MedalAssetId||null,top3MedalAssetId:n.top3MedalAssetId||null}:{})};});
 for(const track of ["SUPPORTER","AGENCY"]){const group=rows.filter(r=>r.track===track).sort((a,b)=>a.min-b.min);if(group.some((r,i)=>i&&(group[i-1].max===null||r.min<=group[i-1].max)))fail();}
 return rows;
}
export function matchCardRange(ranges,track,level){return level==null?null:ranges.find(r=>r.track===track&&level>=r.min&&(r.max===null||level<=r.max))??null;}
export async function profileCardArtwork(db,userId,charmLevel,origin,selectedAgency=undefined){
 const config=await db.profileCardArtwork.findUnique({where:{id:"GLOBAL"}});
 const user=selectedAgency===undefined?await db.user.findUnique({where:{id:userId},select:{agency:true}}):null;
 const agency=selectedAgency===undefined?await profileAgency(db,userId,user?.agency):selectedAgency;
 const progress=agency?await activityProgress("AGENCY",agency.id,origin,db):null;
 const ranges=normalizeCardRanges(config?.ranges??[]);
 const supporter=matchCardRange(ranges,"SUPPORTER",charmLevel),agencyRange=matchCardRange(ranges,"AGENCY",progress?.level);
 const ids=[...new Set([supporter?.backgroundAssetId,supporter?.top1MedalAssetId,supporter?.top2MedalAssetId,supporter?.top3MedalAssetId,agencyRange?.backgroundAssetId,agencyRange?.badgeAssetId,progress?.badgeAssetId].filter(Boolean))];
 const assets=ids.length?await db.uploadAsset.findMany({where:{publicId:{in:ids},active:true,isGlobal:true},select:{publicId:true,mimeType:true,mediaVersion:true,posterMimeType:true,posterMediaVersion:true}}):[];
 const resolve=(id,background=false)=>{const a=assets.find(a=>a.publicId===id);if(!a||!origin||!(background?cardBackgroundTypes:readableMedalTypes).includes(a.mimeType))return null;try{return {url:createPublicDisplayAssetUrl(origin,a),mimeType:a.mimeType,version:a.mediaVersion??null,mediaVersion:a.mediaVersion??null,posterUrl:a.posterMimeType?`${createPublicDisplayAssetUrl(origin,a.publicId,3600,a.posterMediaVersion)}&poster=1`:null,posterMimeType:a.posterMimeType??null};}catch{return null;}};
 const hosts=agency?await db.user.count({where:{agencyId:agency.id,deletedAt:null,appRoles:{has:"HOST"}}}):0;
 const background=resolve(agencyRange?.backgroundAssetId,true),badge=resolve(agencyRange?.badgeAssetId)??resolve(progress?.badgeAssetId);
 return {cardBackgrounds:{supporter:resolve(supporter?.backgroundAssetId,true)},supporterMedals:{top1:resolve(supporter?.top1MedalAssetId),top2:resolve(supporter?.top2MedalAssetId),top3:resolve(supporter?.top3MedalAssetId)},agency:agency?{logoUrl:await agencyLogoUrl(db,agency.logoAssetPublicId,origin),publicId:agency.publicId,name:agency.name,status:agency.status,isOwner:agency.isOwner,ownerPublicId:agency.ownerPublicId,level:progress.level,levelBackground:progress.background,levelBackgroundUrl:progress.backgroundUrl,levelBackgroundMimeType:progress.backgroundMimeType,levelBackgroundMediaVersion:progress.backgroundMediaVersion,totalHosts:hosts,badgeUrl:badge?.url??null,badgeMimeType:badge?.mimeType??null,badgeVersion:badge?.version??null,cardBackgroundUrl:background?.url??null,cardBackgroundMimeType:background?.mimeType??null,cardBackgroundVersion:background?.version??null}:null};
}
