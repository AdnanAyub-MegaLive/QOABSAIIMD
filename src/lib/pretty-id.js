import { randomInt } from "node:crypto";
import { occupiedSpecialId } from "./special-id-commerce.js";

export const validPattern = pattern => typeof pattern === "string" && /^[A-G]{7}$/.test(pattern);
export function fitsPattern(pattern, code) {
  if (!validPattern(pattern) || typeof code !== "string" || !/^[0-9]{7}$/.test(code)) return false;
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
    db.specialIdDefinition.findMany({where:{code:{in:codes}},select:{code:true}}),
    db.specialIdAssignment.findMany({where:{specialId:{in:codes},...occupiedSpecialId(new Date())},select:{specialId:true}}),
  ]);
  const blocked = new Set([...normal.map(x=>x.number), ...reserved.map(x=>x.code), ...occupied.map(x=>x.specialId)]);
  return codes.filter(code=>!blocked.has(code));
}

async function suggestions(db, pattern) {
  const candidates = new Set();
  for (let i=0; i<48; i++) {
    const digits = [..."0123456789"];
    const mapping = new Map([...new Set(pattern)].map(letter => [letter, digits.splice(randomInt(digits.length),1)[0]]));
    candidates.add([...pattern].map(letter=>mapping.get(letter)).join(""));
  }
  return (await available(db,[...candidates])).slice(0,6);
}

export async function listPrettyIds(db,userId) {
  const grants = await db.prettyIdGrant.findMany({where:{userId},orderBy:{createdAt:"desc"},include:{assignment:true}});
  return Promise.all(grants.map(async grant=>({
    id:grant.id, pattern:grant.pattern, durationMinutes:grant.durationMinutes,
    code:grant.assignment?.specialId, expiresAt:grant.assignment?.expiresAt,
    status:grant.assignment?.status, suggestions:grant.assignment ? [] : await suggestions(db,grant.pattern),
  })));
}

function reject(message) { throw Object.assign(new Error(message),{status:409,code:"PRETTY_ID_UNAVAILABLE"}); }
export async function claimPrettyId(db,userId,grantId,code) {
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
    const grant = await tx.prettyIdGrant.findFirst({where:{id:grantId,userId},include:{user:{select:{publicId:true,deletedAt:true,status:true}},assignment:true}});
    if (!grant || grant.user.deletedAt || grant.user.status !== "ACTIVE") reject("This entitlement is unavailable.");
    if (!fitsPattern(grant.pattern,code)) reject("Use seven digits matching the allotted format.");
    let assignment = grant.assignment;
    if (assignment && assignment.specialId !== code) reject("This entitlement was already used.");
    if (!assignment) {
      if (!(await available(tx,[code])).length) reject("That ID is unavailable. Choose another.");
      const now = new Date();
      await tx.specialIdAssignment.updateMany({where:{userId,status:"ACTIVE"},data:{status:"REPLACED",revokedAt:now}});
      assignment = await tx.specialIdAssignment.create({data:{userId,specialId:code,source:"PRETTY_ID",startsAt:now,expiresAt:new Date(+now+grant.durationMinutes*60000)}});
      await tx.prettyIdGrant.update({where:{id:grantId},data:{assignmentId:assignment.id}});
    }
    return {assignmentId:assignment.id,normalId:grant.user.publicId,specialId:code,expiresAt:assignment.expiresAt.toISOString(),active:assignment.status==="ACTIVE" && assignment.expiresAt>new Date()};
  },{isolationLevel:"ReadCommitted"});
}
