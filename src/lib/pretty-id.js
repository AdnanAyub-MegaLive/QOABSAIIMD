import { randomInt } from "node:crypto";
import { occupiedSpecialId } from "./special-id-commerce.js";
import { lockPrettyUser } from "./pretty-id-weekly.js";

export const validPattern = pattern => typeof pattern === "string" && /^[A-Z]{3,7}$/.test(pattern);
export function fitsPattern(pattern, code) {
  if (!validPattern(pattern) || typeof code !== "string" || !/^[A-Z0-9]{3,7}$/.test(code) || code.length !== pattern.length) return false;
  const mapping = new Map();
  for (let i = 0; i < pattern.length; i++) {
    if (mapping.has(pattern[i]) && mapping.get(pattern[i]) !== code[i]) return false;
    mapping.set(pattern[i], code[i]);
  }
  return new Set(mapping.values()).size === mapping.size;
}

async function available(db, codes) {
  const [normal, reserved, occupied] = await Promise.all([
    db.publicNumberReservation.findMany({where:{number:{in:codes},kind:"NORMAL"},select:{number:true}}),
    db.specialIdDefinition.findMany({where:{code:{in:codes,mode:"insensitive"}},select:{code:true}}),
    db.specialIdAssignment.findMany({where:{specialId:{in:codes,mode:"insensitive"},...occupiedSpecialId(new Date())},select:{specialId:true}}),
  ]);
  const blocked = new Set([...normal.map(x=>x.number), ...reserved.map(x=>x.code), ...occupied.map(x=>x.specialId)].map(x=>x.toUpperCase()));
  return codes.filter(code=>!blocked.has(code));
}

async function suggestions(db, pattern) {
  const candidates = new Set();
  for (let i=0; i<48; i++) {
    const digits = [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    const mapping = new Map([...new Set(pattern)].map(letter => [letter, digits.splice(randomInt(digits.length),1)[0]]));
    candidates.add([...pattern].map(letter=>mapping.get(letter)).join(""));
  }
  return (await available(db,[...candidates])).slice(0,6);
}

export async function listPrettyIds(db,userId) {
  const grants = await db.prettyIdGrant.findMany({where:{userId},orderBy:{createdAt:"desc"},include:{assignment:true}});
  return Promise.all(grants.map(async grant=>({
    id:grant.id, pattern:grant.pattern, durationMinutes:grant.durationMinutes,
    level:grant.level, source:grant.source, maintenanceCoins:grant.maintenanceCoins.toString(),
    code:grant.assignment?.specialId, expiresAt:grant.assignment?.expiresAt,
    status:grant.assignment?.expiresAt && grant.assignment.expiresAt <= new Date() ? "EXPIRED" : grant.assignment?.status ?? "UNCLAIMED", suggestions:grant.assignment ? [] : await suggestions(db,grant.pattern),
  })));
}

function reject(message) { throw Object.assign(new Error(message),{status:409,code:"PRETTY_ID_UNAVAILABLE"}); }
export async function claimPrettyId(db,userId,grantId,code) {
  code = typeof code === "string" ? code.trim().toUpperCase() : code;
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
    await lockPrettyUser(tx,userId);
    const grant = await tx.prettyIdGrant.findFirst({where:{id:grantId,userId},include:{user:{select:{publicId:true,deletedAt:true,status:true}},assignment:true}});
    if (!grant || grant.user.deletedAt || grant.user.status !== "ACTIVE") reject("This entitlement is unavailable.");
    if (!fitsPattern(grant.pattern,code)) reject("Use letters or digits matching your allotted format and length.");
    let assignment = grant.assignment;
    if (assignment && assignment.specialId !== code) reject("This entitlement was already used.");
    if (!assignment) {
      if (!(await available(tx,[code])).length) reject("That ID is unavailable. Choose another.");
      const now = new Date();
      assignment = await tx.specialIdAssignment.create({data:{userId,specialId:code,source:"PRETTY_ID",status:"CLAIMED",startsAt:now,expiresAt:null}});
      await tx.prettyIdGrant.update({where:{id:grantId},data:{assignmentId:assignment.id}});
    }
    return {assignmentId:assignment.id,normalId:grant.user.publicId,specialId:code,expiresAt:assignment.expiresAt?.toISOString() ?? null,activationRequired:assignment.status==="CLAIMED",active:assignment.status==="ACTIVE" && assignment.expiresAt>new Date()};
  },{isolationLevel:"ReadCommitted"});
}

export async function activatePrettyId(db,userId,grantId) {
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
    const user=await lockPrettyUser(tx,userId);
    const grant=await tx.prettyIdGrant.findFirst({where:{id:grantId,userId},include:{assignment:true}});
    const assignment=grant?.assignment, now=new Date();
    if(!assignment || assignment.revokedAt || !['CLAIMED','OWNED','ACTIVE'].includes(assignment.status) || (assignment.expiresAt && assignment.expiresAt<=now)) reject("Claim an available ID before activating it. Expired IDs cannot be reactivated.");
    const expiresAt=assignment.expiresAt ?? new Date(+now+grant.durationMinutes*60000);
    // Switching preserves ownership and elapsed time of every Pretty ID.
    await tx.specialIdAssignment.updateMany({where:{userId,status:'ACTIVE',source:'PRETTY_ID',id:{not:assignment.id}},data:{status:'OWNED'}});
    await tx.specialIdAssignment.updateMany({where:{userId,status:'ACTIVE',source:{not:'PRETTY_ID'},id:{not:assignment.id}},data:{status:'REPLACED',revokedAt:now}});
    await tx.specialIdAssignment.update({where:{id:assignment.id},data:{status:'ACTIVE',expiresAt,...(!assignment.expiresAt?{startsAt:now}:{})}});
    return {assignmentId:assignment.id,normalId:user.publicId,specialId:assignment.specialId,expiresAt:expiresAt.toISOString(),active:true};
  },{isolationLevel:'ReadCommitted'});
}
