import { prisma } from "./prisma.js";
import { requireMobileUser, mobileJson, mobileApiError } from "./mobile-api";
import { withV1Request, v1Options } from "./mobile-v1";
import { TRACKS, progressionError, progressionSnapshots, currentConfiguration } from "./progression.js";
import { requestOrigin } from "./user-perks.js";
import { createPublicDisplayAssetUrl } from "./upload-assets.js";
export function progressionOptions(request) { return v1Options(request,"GET, OPTIONS"); }
export function progressionRead(request,kind) {
  return withV1Request(request,{path:new URL(request.url).pathname,methods:"GET, OPTIONS",rateLimit:{limit:60,windowMs:60000}},async()=>{
    try {
      const user=await requireMobileUser(request),query=new URL(request.url).searchParams,origin=requestOrigin(request);
      if(kind==="me")return mobileJson({success:true,data:{userId:user.publicId,tracks:await progressionSnapshots(user.id,origin)}});
      const track=query.get("track");if(!TRACKS.includes(track))throw progressionError("track must be USER or CHARM.");
      if(kind==="levels") {
        const version=query.get("version");if(version!==null&&(!/^\d+$/.test(version)||!Number.isSafeInteger(Number(version))||Number(version)<1))throw progressionError("Invalid configuration version.");
        const config=version?await prisma.progressionConfiguration.findUnique({where:{version:Number(version)},include:{levels:true}}):await currentConfiguration();
        if(!config)return mobileJson({success:false,error:{code:"LEVELS_NOT_FOUND",message:"Configuration not found."}},404);
        return mobileJson({success:true,data:{track,configurationVersion:config.version,enabled:config.enabled,levels:config.levels.filter(l=>l.track===track).sort((a,b)=>a.level-b.level).map(l=>({level:l.level,thresholdPoints:l.thresholdPoints.toString(),badgeUrl:l.badgeAssetId?createPublicDisplayAssetUrl(origin,l.badgeAssetId):null,benefits:l.benefits,rewards:[]})),earningRules:config.rules.filter(r=>r.track===track).map(r=>({code:`${r.source}_${track==="USER"?"SENT":"RECEIVED"}`,description:r.description,numerator:r.numerator,denominator:r.denominator,basis:r.basis,recipientType:r.recipientType,allowSelf:r.allowSelf}))}});
      }
      const limit=Number(query.get("limit")??20);if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw progressionError("limit must be 1–50.");
      let cursor;
      if(query.get("cursor"))try{cursor=JSON.parse(Buffer.from(query.get("cursor"),"base64url").toString());if(typeof cursor.id!=="string"||!cursor.id||cursor.id.length>128||!Number.isFinite(+new Date(cursor.createdAt)))throw Error();}catch{throw progressionError("Invalid history cursor.");}
      const rows=await prisma.progressLedger.findMany({where:{userId:user.id,track,...(cursor?{OR:[{createdAt:{lt:new Date(cursor.createdAt)}},{createdAt:new Date(cursor.createdAt),id:{lt:cursor.id}}]}:{})},orderBy:[{createdAt:"desc"},{id:"desc"}],take:limit+1});
      const page=rows.slice(0,limit),last=page.at(-1);
      return mobileJson({success:true,data:{track,entries:page.map(r=>({id:r.id,sourceType:r.sourceType,sourceId:r.sourceId,deltaPoints:r.deltaPoints.toString(),ruleVersion:r.ruleVersion,createdAt:r.createdAt.toISOString()})),nextCursor:rows.length>limit?Buffer.from(JSON.stringify({id:last.id,createdAt:last.createdAt.toISOString()})).toString("base64url"):null}});
    }catch(error){return mobileApiError(error,"PROGRESSION_READ_FAILED");}
  });
}
