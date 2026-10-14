import { prisma } from "./prisma.js";
import { versionedUrl } from "./media-version.js";
// Batch enrichment at the delivery boundary avoids per-asset database queries
// and also covers legacy stored URLs and callers that only know a public ID.
export async function versionMediaPayload(payload,db=prisma) {
 const ids=new Set();
 const parse=value=>{if(typeof value!=="string")return null;try{const url=new URL(value,"https://relative.invalid");const match=/^\/api\/uploads\/([A-Za-z0-9_-]+)\/file$/.exec(url.pathname);return match?{id:match[1],poster:url.searchParams.get("poster")==="1"}:null;}catch{return null;}};
 function scan(value){if(Array.isArray(value)){value.forEach(scan);return;}if(!value||typeof value!=="object"||value instanceof Date)return;for(const item of Object.values(value)){const media=parse(item);if(media)ids.add(media.id);else scan(item);}}
 scan(payload);if(!ids.size)return payload;
 const assets=await db.uploadAsset.findMany({where:{publicId:{in:[...ids]}},select:{publicId:true,mediaVersion:true,posterMediaVersion:true}});
 const versions=new Map(assets.map(a=>[a.publicId,a]));
 function visit(value){if(Array.isArray(value))return value.map(visit);if(!value||typeof value!=="object"||value instanceof Date)return value;const result={...value};for(const [key,item] of Object.entries(value)){
  const media=parse(item),asset=media&&versions.get(media.id);
  if(asset){const version=media.poster?asset.posterMediaVersion:asset.mediaVersion;result[key]=versionedUrl(item,version);const name=media.poster?(key==="posterUrl"?"posterMediaVersion":key.replace(/Url$/,"")+"MediaVersion"):["url","mediaUrl","imageUrl"].includes(key)?"mediaVersion":key.replace(/Url$/,"")+"MediaVersion";result[name]=version??null;}
  else result[key]=visit(item);
 }return result;}
 return visit(payload);
}
