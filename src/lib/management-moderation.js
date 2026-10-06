import { prisma } from "./prisma.js";
import { managementRole } from "./user-roles.js";
import { normalizeSignupCountry } from "./geo-country.js";
import { managementFailure } from "./management-web.js";
export async function countryModerator(userId,db=prisma){const user=await db.user.findUnique({where:{id:userId}});if(!user||user.deletedAt||user.status!=="ACTIVE"||managementRole(user)!=="SUPER_ADMIN")throw managementFailure("Super Admin moderation permission is required.");const country=normalizeSignupCountry(user.country);if(!country)throw managementFailure("Your country must be assigned.");return {user,country};}
export async function moderationSearch(userId,type,q,db=prisma){const {country}=await countryModerator(userId,db);if(!["USER","ROOM"].includes(type))throw managementFailure("Choose User or Room.",422);const search=String(q??"").trim().slice(0,100);if(!search)return [];
  if(type==="USER")return db.user.findMany({where:{country,deletedAt:null,OR:[{publicId:{contains:search,mode:"insensitive"}},{name:{contains:search,mode:"insensitive"}}]},select:{publicId:true,name:true,country:true,status:true},take:30});
  return db.audioRoom.findMany({where:{owner:{country,deletedAt:null},OR:[{roomId:{contains:search,mode:"insensitive"}},{title:{contains:search,mode:"insensitive"}}]},select:{roomId:true,title:true,isBlocked:true,blockedReason:true,blockedUntil:true},take:30});
}
export async function moderateCountryTarget(userId,input,db=prisma){const {type,action,publicId}=input;if(!["USER","ROOM"].includes(type)||!["BAN","UNBAN"].includes(action)||typeof publicId!=="string")throw managementFailure("Invalid moderation action.",422);const reason=String(input.reason??"").trim(),duration=Number(input.durationMinutes??0);if(!reason||reason.length>1000||!Number.isSafeInteger(duration)||duration<0||duration>525600)throw managementFailure("Provide a reason and a duration from 0 (permanent) to 525600 minutes.",422);
  return db.$transaction(async tx=>{const {user,country}=await countryModerator(userId,tx),expiresAt=action==="BAN"&&duration?new Date(Date.now()+duration*60000):null;
    if(type==="USER"){
      const target=await tx.user.findUnique({where:{publicId}});if(!target||target.deletedAt||normalizeSignupCountry(target.country)!==country)throw managementFailure("This user is outside your country or unavailable.");
      if(target.id===user.id)throw managementFailure("You cannot moderate your own account.");
      if(action==="BAN"){await tx.ban.create({data:{target:"USER",userId:target.id,actorUserId:user.id,reason,durationMinutes:duration||null,expiresAt}});await tx.user.update({where:{id:target.id},data:{status:"BANNED",sessionVersion:{increment:1},forcedLogoutAt:new Date()}});}
      else {if(target.status!=="BANNED")throw managementFailure("Only banned accounts can be unbanned.",409);await tx.ban.updateMany({where:{userId:target.id,target:"USER",revokedAt:null},data:{revokedAt:new Date()}});await tx.user.update({where:{id:target.id},data:{status:"ACTIVE"}});}
    }else{
      const room=await tx.audioRoom.findUnique({where:{roomId:publicId},include:{owner:{select:{country:true,deletedAt:true}}}});if(!room||room.owner.deletedAt||normalizeSignupCountry(room.owner.country)!==country)throw managementFailure("This room is outside your country or unavailable.");
      await tx.audioRoom.update({where:{id:room.id},data:{isBlocked:action==="BAN",blockedReason:action==="BAN"?reason:null,blockedUntil:expiresAt,revision:{increment:1}}});
    }
    await tx.auditLog.create({data:{action:`COUNTRY_${type}_${action}`,category:"SECURITY",entityType:type==="USER"?"User":"AudioRoom",entityId:publicId,description:`${user.publicId}: ${reason}`,metadata:{actorUserId:user.id,country,reason,expiresAt:expiresAt?.toISOString()??null}}});
    return {publicId,type,action,reason,expiresAt:expiresAt?.toISOString()??null};
  },{isolationLevel:"Serializable"});
}
export async function countryModerationHistory(userId,db=prisma){const {country}=await countryModerator(userId,db);return db.auditLog.findMany({where:{action:{startsWith:"COUNTRY_"},metadata:{path:["country"],equals:country}},select:{id:true,action:true,entityId:true,description:true,createdAt:true,metadata:true},orderBy:{createdAt:"desc"},take:100});}
