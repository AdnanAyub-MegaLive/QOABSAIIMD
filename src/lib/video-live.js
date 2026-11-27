import { resolveUserPerks } from "./user-perks.js";
import { resolveGiftSender } from "./gift-sender.js";
import { videoError } from "./video-access.js";
export async function serializeVideoLive(session,origin,perkMap=null){const perks=(perkMap??await resolveUserPerks([session.host],origin,["FRAMES","BADGES"])).get(session.host.publicId);return{id:session.publicId,title:session.title,announcement:session.announcement??null,category:session.category??"CHAT",privacyMode:session.privacyMode??"PUBLIC",mode:session.mode??"SOLO",maxGuests:session.mode==="GROUP"?8:5,coverUrl:session.coverUrl?new URL(session.coverUrl,origin).toString():null,status:session.status,hostAway:session.hostAway,viewerCount:session.viewerCount,peakViewers:session.peakViewers,likeCount:session.likeCount,giftIncome:session.giftIncome.toString(),revision:session.revision,startedAt:session.startedAt.toISOString(),endedAt:session.endedAt?.toISOString()??null,host:{publicId:session.host.publicId,name:session.host.name,profileImage:session.host.profileImage??null,country:liveCountry(session.host.country),frameUrl:perks?.frameUrl??null,frameMimeType:perks?.frameMimeType??null,framePosterUrl:perks?.framePosterUrl??null,badgeUrl:perks?.badgeUrl??null}}}

export async function liveTopGifter(db,sessionId,origin,minCoins=0n){
  const session=await db.videoLiveSession.findUnique({where:{id:sessionId},select:{hostId:true}});
  const [top]=await db.giftTransaction.groupBy({by:["senderId"],where:{liveSessionId:sessionId,reversedAt:null,...(session?.hostId?{senderId:{not:session.hostId}}:{})},_sum:{coinValue:true},_max:{createdAt:true},orderBy:[{_sum:{coinValue:"desc"}},{_max:{createdAt:"asc"}}],take:1});
  if(!top?._sum?.coinValue||top._sum.coinValue<BigInt(minCoins??0))return null;
  const user=await db.user.findUnique({where:{id:top.senderId},select:{id:true,publicId:true,name:true,profileImage:true}});
  if(!user)return null;
  const perks=(await resolveUserPerks([user],origin,["FRAMES"]).catch(()=>new Map())).get(user.publicId);
  return{publicId:user.publicId,name:user.name,profileImage:user.profileImage??null,frameUrl:perks?.frameUrl??null,frameMimeType:perks?.frameMimeType??null,totalCoins:top._sum.coinValue.toString()};
}
export const liveCountry=country=>String(country??"").trim().toUpperCase()||null;
export const liveCountryWhere=country=>{const code=liveCountry(country);return code?{host:{country:{equals:code,mode:"insensitive"}}}:{host:{OR:[{country:null},{country:""}]}}};
export const samePkCountry=(a,b)=>liveCountry(a)===liveCountry(b);
export function requireSamePkCountry(a,b){if(!samePkCountry(a,b))throw videoError("PK_COUNTRY_MISMATCH","PK is only available with hosts from your country.",403)}
const senderCache=new Map();export const LIVE_SENDER_TTL_MS=45_000;const LIVE_SENDER_MAX=5000;
export function clearLiveChatSenderCache(){senderCache.clear()}
export async function liveChatSender(user,origin,now=Date.now()){const key=`${user.id??user.publicId}|${origin}`,hit=senderCache.get(key);if(hit&&hit.at>now-LIVE_SENDER_TTL_MS){senderCache.delete(key);senderCache.set(key,hit);return hit.value}try{const sender=await resolveGiftSender(user,origin),value={...sender,badgeUrls:sender.badgeUrl?[sender.badgeUrl]:[],isOfficial:Boolean(user.isOfficial)};senderCache.delete(key);senderCache.set(key,{at:now,value});while(senderCache.size>LIVE_SENDER_MAX)senderCache.delete(senderCache.keys().next().value);return value}catch{return{publicId:user.publicId,name:user.name,profileImage:user.profileImage??null,badgeUrls:[],isOfficial:Boolean(user.isOfficial)}}}
