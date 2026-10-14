import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
export function hashGiftCatalog(assets){
 return createHash("sha256").update(JSON.stringify([...assets].sort((a,b)=>a.publicId.localeCompare(b.publicId)).map(a=>[a.publicId,a.mediaVersion??null,a.posterMediaVersion??null,String(a.coinPrice??0),a.active,a.giftTier,a.giftCategory,a.name,a.details,a.tags,a.minimumVipLevel,a.senderXp?.toString(),a.receiverXp?.toString()]))).digest("hex");
}
export async function giftCatalogVersion(db=prisma){return hashGiftCatalog(await db.uploadAsset.findMany({where:{category:{in:["GIFTS","LIVE_GIFTS"]}},select:{publicId:true,mediaVersion:true,posterMediaVersion:true,coinPrice:true,active:true,giftTier:true,giftCategory:true,name:true,details:true,tags:true,minimumVipLevel:true,senderXp:true,receiverXp:true}}));}
export async function notifyGiftCatalogUpdated(){
 try {
 const catalogVersion=await giftCatalogVersion();
 globalThis.portalIo?.emit("gifts:catalog-updated",{catalogVersion});
 return catalogVersion;
 } catch(error) {
  // The upload is already committed. Do not report it as failed and invite a duplicate.
  console.error("Gift catalogue notification failed",error);
  return null;
 }
}
