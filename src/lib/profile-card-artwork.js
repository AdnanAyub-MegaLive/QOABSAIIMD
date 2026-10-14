import {createPublicDisplayAssetUrl} from "./upload-assets.js";
import {activityProgress} from "./activity-levels.js";
export function validateCardRanges(input){
 const fail=()=>{throw Object.assign(new Error("Use non-overlapping level ranges and uploaded asset IDs."),{status:422});};
 if(!Array.isArray(input)||input.length>100)fail();
 const rows=input.map(r=>{if(!r||!["SUPPORTER","AGENCY"].includes(r.track)||!Number.isSafeInteger(r.min)||r.min<0||r.max!==null&&(!Number.isSafeInteger(r.max)||r.max<r.min))fail();for(const k of ["backgroundAssetId","badgeAssetId"])if(r[k]!=null&&!/^AST-[A-Za-z0-9-]+$/.test(r[k]))fail();return {track:r.track,min:r.min,max:r.max,backgroundAssetId:r.backgroundAssetId||null,badgeAssetId:r.track==="AGENCY"?r.badgeAssetId||null:null};});
 for(const track of ["SUPPORTER","AGENCY"]){const group=rows.filter(r=>r.track===track).sort((a,b)=>a.min-b.min);if(group.some((r,i)=>i&&(group[i-1].max===null||r.min<=group[i-1].max)))fail();}
 return rows;
}
export function matchCardRange(ranges,track,level){return level==null?null:ranges.find(r=>r.track===track&&level>=r.min&&(r.max===null||level<=r.max))??null;}
export async function profileCardArtwork(db,userId,charmLevel,origin){
 const [config,user]=await Promise.all([db.profileCardArtwork.findUnique({where:{id:"GLOBAL"}}),db.user.findUnique({where:{id:userId},select:{agency:{select:{id:true,publicId:true,name:true,status:true}}}})]);
 const agency=user?.agency?.status==="ACTIVE"?user.agency:null;
 const progress=agency?await activityProgress("AGENCY",agency.id,origin,db):null;
 const supporter=matchCardRange(config?.ranges??[],"SUPPORTER",charmLevel),agencyRange=matchCardRange(config?.ranges??[],"AGENCY",progress?.level);
 const ids=[supporter?.backgroundAssetId,agencyRange?.backgroundAssetId,agencyRange?.badgeAssetId].filter(Boolean);
 const assets=ids.length?await db.uploadAsset.findMany({where:{publicId:{in:ids},active:true,isGlobal:true},select:{publicId:true,mimeType:true}}):[];
 const resolve=id=>{const a=assets.find(a=>a.publicId===id);return a&&origin?{url:createPublicDisplayAssetUrl(origin,id),mimeType:a.mimeType}:null;};
 const hosts=agency?await db.user.count({where:{agencyId:agency.id,deletedAt:null,appRoles:{has:"HOST"}}}):0;
 const background=resolve(agencyRange?.backgroundAssetId);
 return {cardBackgrounds:{supporter:resolve(supporter?.backgroundAssetId)},agency:agency?{publicId:agency.publicId,name:agency.name,status:agency.status,level:progress.level,totalHosts:hosts,badgeUrl:resolve(agencyRange?.badgeAssetId)?.url??progress.badgeUrl,cardBackgroundUrl:background?.url??null,cardBackgroundMimeType:background?.mimeType??null}:null};
}
