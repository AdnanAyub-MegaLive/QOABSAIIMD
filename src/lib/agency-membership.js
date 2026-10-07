import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { primaryLegacyRole } from "./user-roles.js";
import { talentPublicIdForApprovedHost } from "./host-public-id.js";
const fail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code,status});};
export function assertMembershipResponder(row,actorId){
  const allowed=row.direction==="OWNER_INVITE"?row.userId:row.agency.ownerUserId;
  if(actorId!==allowed)fail("FORBIDDEN","Only the receiving party can accept or reject this request.",403);
}
export async function createMembership(actorId,{agencyId,userPublicId,invite=false},db=prisma){
 return db.$transaction(async tx=>{
  const agency=await tx.agency.findUnique({where:invite?{ownerUserId:actorId}:{publicId:agencyId}});
  if(!agency)fail("AGENCY_NOT_FOUND","Agency not found.",404);
  if(agency.status!=="ACTIVE")fail("AGENCY_INACTIVE","Agency is not active.");
  const user=await tx.user.findUnique({where:invite?{publicId:userPublicId}:{id:actorId}});
  if(!user||user.deletedAt||user.status!=="ACTIVE")fail("USER_NOT_FOUND","An active user is required.",404);
  if(user.agencyId||await tx.agency.findUnique({where:{ownerUserId:user.id}}))fail("ALREADY_HAS_AGENCY","User already belongs to or owns an agency.");
  if(await tx.agencyJoinRequest.findFirst({where:{userId:user.id,status:"PENDING"}}))fail("ALREADY_REQUESTED","User already has a pending request or invitation.");
  const row=await tx.agencyJoinRequest.create({data:{publicId:`AGJ-${randomUUID()}`,userId:user.id,agencyId:agency.id,direction:invite?"OWNER_INVITE":"USER_REQUEST"}});
  await tx.auditLog.create({data:{action:invite?"AGENCY_USER_INVITED":"AGENCY_JOIN_REQUESTED",category:"AGENCY_MANAGEMENT",entityType:"AgencyJoinRequest",entityId:row.publicId,description:"Agency membership offered; awaiting receiving party consent.",metadata:{actorId,userId:user.id,agencyId:agency.id,direction:row.direction}}});
  return {requestId:row.publicId,direction:row.direction,status:row.status};
 },{isolationLevel:"Serializable"});
}
export async function respondMembership(actorId,requestId,accept,db=prisma){
 if(typeof accept!=="boolean")fail("VALIDATION_ERROR","accept must be true or false.",422);
 return db.$transaction(async tx=>{
  const row=await tx.agencyJoinRequest.findUnique({where:{publicId:requestId},include:{agency:true,user:true}});
  if(!row)fail("REQUEST_NOT_FOUND","Request not found.",404);
  assertMembershipResponder(row,actorId);
  if(row.status!=="PENDING")fail("REQUEST_ALREADY_RESOLVED","Request already resolved.");
  const status=accept?"APPROVED":"REJECTED",previousUserId=row.user.publicId;
  let userId=previousUserId;
  if(accept){
   if(row.agency.status!=="ACTIVE"||row.user.deletedAt||row.user.status!=="ACTIVE")fail("AGENCY_INACTIVE","Agency or user is no longer active.");
   if(row.user.agencyId||await tx.agency.findUnique({where:{ownerUserId:row.userId}}))fail("ALREADY_HAS_AGENCY","User already belongs to or owns an agency.");
   userId=talentPublicIdForApprovedHost(previousUserId);
   const roles=[...new Set([...row.user.appRoles,"HOST"])];
   await tx.user.update({where:{id:row.userId},data:{publicId:userId,agencyId:row.agencyId,appRoles:roles,role:primaryLegacyRole(roles,row.user.role),...(userId!==previousUserId?{sessionVersion:{increment:1}}:{})}});
   await tx.legacyIdMapping.updateMany({where:{userId:row.userId,entityType:"USER"},data:{publicId:userId}});
  }
  await tx.agencyJoinRequest.update({where:{id:row.id},data:{status,reviewedAt:new Date(),reviewNote:row.direction==="OWNER_INVITE"?"Responded by invited user.":"Responded by agency owner."}});
  await tx.auditLog.create({data:{action:`AGENCY_MEMBERSHIP_${status}`,category:"AGENCY_MANAGEMENT",entityType:"AgencyJoinRequest",entityId:requestId,description:"Membership decision by receiving party; KYC unchanged.",metadata:{actorId,previousUserId,userId,direction:row.direction}}});
  return {requestId,status,direction:row.direction,previousUserId,userId,agencyId:row.agency.publicId,sessionInvalidated:accept&&userId!==previousUserId};
 },{isolationLevel:"Serializable"});
}
