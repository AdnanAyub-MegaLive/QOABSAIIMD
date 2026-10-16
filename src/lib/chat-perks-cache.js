import { resolveUserPerks } from "./user-perks.js";
const cache=globalThis.chatPerksCache??=new Map();
export function invalidateChatPerks(userId){for(const key of cache.keys())if(key.startsWith(`${userId}:`))cache.delete(key);}
export async function chatSenderPerks(user,origin){
 const key=`${user.id}:${origin}`,now=Date.now(),entry=cache.get(key);
 if(entry&&entry.until>now)return entry.value;
 const value=(await resolveUserPerks([user],origin,["FRAMES","BADGES","CHAT_BOXES"])).get(user.publicId);
 if(cache.size>=2000)cache.delete(cache.keys().next().value);
 cache.set(key,{until:now+60000,value});return value;
}
