import { prisma } from "./prisma.js";
import { versionedUrl } from "./media-version.js";
// Batch enrichment at the delivery boundary avoids per-asset database queries
// and also covers legacy stored URLs and callers that only know a public ID.
const versionName=(key,media)=>media.poster?(key==="posterUrl"?"posterMediaVersion":key.replace(/Url$/,"")+"MediaVersion"):["url","mediaUrl","imageUrl"].includes(key)?"mediaVersion":key.replace(/Url$/,"")+"MediaVersion";
export async function versionMediaPayload(payload,db=prisma,versionCache=null) {
 const ids=new Set();
 const parse=value=>{if(typeof value!=="string")return null;try{const url=new URL(value,"https://relative.invalid");const match=/^\/api\/uploads\/([A-Za-z0-9_-]+)\/file$/.exec(url.pathname);return match?{id:match[1],poster:url.searchParams.get("poster")==="1"}:null;}catch{return null;}};
 function scan(value){if(Array.isArray(value)){value.forEach(scan);return;}if(!value||typeof value!=="object"||value instanceof Date)return;for(const item of Object.values(value)){const media=parse(item);if(media)ids.add(media.id);else scan(item);}}
 scan(payload);if(!ids.size)return payload;
 const versions=versionCache ?? new Map();
 const missing=[...ids].filter(id=>!versions.has(id));
 if(missing.length) {
  const assets=await db.uploadAsset.findMany({where:{publicId:{in:missing}},select:{publicId:true,mediaVersion:true,posterMediaVersion:true,mimeType:true,posterMimeType:true}});
  for(const id of missing) versions.set(id,null);
  for(const asset of assets) versions.set(asset.publicId,asset);
 }
 function visit(value){if(Array.isArray(value))return value.map(visit);if(!value||typeof value!=="object"||value instanceof Date)return value;const result={...value},nameCounts=new Map();for(const [key,item] of Object.entries(value)){const media=parse(item);if(media){const name=versionName(key,media);nameCounts.set(name,(nameCounts.get(name)??0)+1);}}for(const [key,item] of Object.entries(value)){
  const media=parse(item),asset=media&&versions.get(media.id);
  if(asset){const version=media.poster?asset.posterMediaVersion:asset.mediaVersion;result[key]=versionedUrl(item,version);const name=versionName(key,media);result[name]=version??null;if(nameCounts.get(name)===1){const prefix=name.slice(0,-"MediaVersion".length),idName=prefix?`${prefix}AssetId`:"assetId",typeName=prefix?`${prefix}MimeType`:"mimeType";if(!Object.hasOwn(value,idName)&&!Object.hasOwn(result,idName))result[idName]=media.id;const type=media.poster?asset.posterMimeType:asset.mimeType;if(type&&!Object.hasOwn(value,typeName)&&!Object.hasOwn(result,typeName))result[typeName]=type;}}
  else result[key]=visit(item);
 }return result;}
 return visit(payload);
}
