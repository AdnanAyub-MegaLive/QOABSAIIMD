import { resolveUserPerks } from "./user-perks.js";
export async function serializeVideoLive(session,origin){const perks=(await resolveUserPerks([session.host],origin,["FRAMES","BADGES"])).get(session.host.publicId);return{id:session.publicId,title:session.title,announcement:session.announcement??null,category:session.category??"CHAT",privacyMode:session.privacyMode??"PUBLIC",mode:session.mode??"SOLO",maxGuests:session.mode==="GROUP"?8:4,coverUrl:session.coverUrl?new URL(session.coverUrl,origin).toString():null,status:session.status,hostAway:session.hostAway,viewerCount:session.viewerCount,peakViewers:session.peakViewers,likeCount:session.likeCount,giftIncome:session.giftIncome.toString(),revision:session.revision,startedAt:session.startedAt.toISOString(),endedAt:session.endedAt?.toISOString()??null,host:{publicId:session.host.publicId,name:session.host.name,profileImage:session.host.profileImage??null,frameUrl:perks?.frameUrl??null,frameMimeType:perks?.frameMimeType??null,framePosterUrl:perks?.framePosterUrl??null,badgeUrl:perks?.badgeUrl??null}}}

export async function liveTopGifter(db,sessionId,origin){
  const [top]=await db.giftTransaction.groupBy({by:["senderId"],where:{liveSessionId:sessionId},_sum:{coinValue:true},orderBy:{_sum:{coinValue:"desc"}},take:1});
  if(!top?._sum?.coinValue)return null;
  const user=await db.user.findUnique({where:{id:top.senderId},select:{id:true,publicId:true,name:true,profileImage:true}});
  if(!user)return null;
  const perks=(await resolveUserPerks([user],origin,["FRAMES"]).catch(()=>new Map())).get(user.publicId);
  return{publicId:user.publicId,name:user.name,profileImage:user.profileImage??null,frameUrl:perks?.frameUrl??null,frameMimeType:perks?.frameMimeType??null,totalCoins:top._sum.coinValue.toString()};
}
