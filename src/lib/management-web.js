import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";
import { assertMobileSession } from "./mobile-session-state.js";
import { managementRole } from "./user-roles.js";
export const MANAGEMENT_COOKIE = "mega_management";
export const tokenHash = value => createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
export function managementFailure(message="Management access is unavailable.",status=403) { return Object.assign(new Error(message),{status,code:"MANAGEMENT_FORBIDDEN"}); }
export function portalOrigin() {
  const url=new URL(process.env.MOBILE_API_BASE_URL || "http://localhost:3300");
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw managementFailure("Invalid portal origin configuration.",503);
  if(process.env.NODE_ENV==="production"&&url.protocol!=="https:")throw managementFailure("HTTPS portal origin is required.",503);
  return url.origin;
}
export async function validateManagementSession(row,db=prisma) {
  if(!row||row.expiresAt<=new Date()||row.mobileExpiresAt<=new Date())throw managementFailure("Open Management Portal again from the application.",401);
  const user=await db.user.findUnique({where:{id:row.userId}});
  assertMobileSession(user,{sessionVersion:row.sessionVersion,issuedAt:Number(row.mobileIssuedAt)});
  if(!["SUPER_ADMIN","COUNTRY_HEAD"].includes(managementRole(user)))throw managementFailure();
  if(row.deviceId){const device=await db.device.findUnique({where:{userId_macAddress:{userId:user.id,macAddress:row.deviceId}}});if(!device||device.isBanned)throw managementFailure("Device access revoked.",401);}
  if(await db.ban.findFirst({where:{userId:user.id,target:"USER",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}}))throw managementFailure("Account access revoked.",401);
  return user;
}
export async function issueManagementHandoff(user,payload,db=prisma) {
  const token=opaque(),expiresAt=new Date(Math.min(Date.now()+60000,payload.exp*1000));
  const data={userId:user.id,sessionVersion:payload.sessionVersion,deviceId:payload.deviceId??null,mobileIssuedAt:BigInt(payload.issuedAt),mobileExpiresAt:new Date(payload.exp*1000),expiresAt,kind:"HANDOFF",tokenHash:tokenHash(token)};
  await validateManagementSession(data,db);
  await db.managementWebSession.create({data});
  return {url:`${portalOrigin()}/management/launch#ticket=${token}`,expiresAt:expiresAt.toISOString()};
}
export async function consumeManagementHandoff(ticket,db=prisma) {
  if(typeof ticket!=="string"||! /^[A-Za-z0-9_-]{43}$/.test(ticket))throw managementFailure("Invalid portal handoff.",401);
  const token=opaque();
  await db.$transaction(async tx=>{
    const row=await tx.managementWebSession.findUnique({where:{tokenHash:tokenHash(ticket)}});
    if(row?.kind!=="HANDOFF"||row.consumedAt)throw managementFailure("This portal link has expired or was already used.",401);
    const user=await validateManagementSession(row,tx);
    const changed=await tx.managementWebSession.updateMany({where:{id:row.id,consumedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});
    if(!changed.count)throw managementFailure("Portal link already used.",401);
    await tx.managementWebSession.create({data:{userId:user.id,sessionVersion:row.sessionVersion,deviceId:row.deviceId,mobileIssuedAt:row.mobileIssuedAt,mobileExpiresAt:row.mobileExpiresAt,tokenHash:tokenHash(token),kind:"BROWSER",expiresAt:new Date(Math.min(Date.now()+30*60000,+row.mobileExpiresAt))}});
    await tx.auditLog.create({data:{action:"MANAGEMENT_PORTAL_LOGIN",category:"SECURITY",entityType:"User",entityId:user.publicId,description:"Application user opened their scoped management portal."}});
  },{isolationLevel:"Serializable"});
  return token;
}
export async function browserManagementUser(token,db=prisma) {
  if(typeof token!=="string"||! /^[A-Za-z0-9_-]{43}$/.test(token))throw managementFailure("Open this portal from the application.",401);
  const row=await db.managementWebSession.findUnique({where:{tokenHash:tokenHash(token)}});
  if(row?.kind!=="BROWSER"||row.consumedAt)throw managementFailure("Portal session unavailable.",401);
  return validateManagementSession(row,db);
}
