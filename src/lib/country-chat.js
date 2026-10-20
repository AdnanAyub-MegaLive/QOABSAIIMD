import { normalizeSignupCountry as normalizeCountryCode } from "./geo-country.js";
export const countryChatError = () => Object.assign(new Error("Set your country in your profile to use Country Chat."),{code:"COUNTRY_REQUIRED",validationMessage:"Set your country in your profile to use Country Chat."});
export async function userChatCountry(db,userId,required=false){
  const user=await db.user.findUnique({where:{id:userId},select:{country:true}});
  const country=normalizeCountryCode(user?.country);
  if(required&&!country)throw countryChatError();
  return country;
}
export function countryMessageFilter(country){return {senderCountry:country??"__NO_COUNTRY__"};}
export function assertNoCountryLinks(text){
  const normalized=String(text).normalize("NFKC").replace(/\p{Cf}/gu,"");
  if(/https?:\/\/|www\.|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,63}|xn--[a-z0-9-]+)(?=$|[^\p{L}\p{N}-])/iu.test(normalized)){
    throw Object.assign(new Error("Links are not allowed in Country Chat."),{code:"LINK_NOT_ALLOWED",validationMessage:"Links are not allowed in Country Chat."});
  }
}
export async function refreshCountryChatRooms(db,io){
  if(!io?.sockets?.sockets)return;
  const sockets=[...io.sockets.sockets.values()];
  const people=await db.user.findMany({where:{publicId:{in:[...new Set(sockets.map(s=>s.data.userId).filter(Boolean))]},status:"ACTIVE",deletedAt:null},select:{publicId:true,country:true}});
  const countries=new Map(people.map(p=>[p.publicId,normalizeCountryCode(p.country)]));
  for(const socket of sockets){
    const country=countries.get(socket.data.userId);
    const room=country?`conversation:CONV-WORLD:${country}`:null;
    for(const joined of socket.rooms)if(joined==="conversation:CONV-WORLD"||(joined.startsWith("conversation:CONV-WORLD:")&&joined!==room))await socket.leave(joined);
    if(room)await socket.join(room);
  }
}
