import { prisma } from "./prisma.js";
import { occupiedSpecialId, activeSpecialIdWhere, retainActiveSpecialIds, reconcileUserSpecialIds, publishSpecialIdentity } from "./special-id-ownership.js";

export async function activeSpecialIds(userIds, db = prisma) {
  if (!userIds.length) return new Map();
  const now = new Date();
  const rows = await db.specialIdAssignment.findMany({
    where: { userId: { in: [...new Set(userIds)] }, ...activeSpecialIdWhere(now) },
    select: { userId: true, specialId: true }, orderBy: [{ expiresAt: "desc" }, { id: "asc" }],
  });
  const result = new Map();
  for (const row of rows) if (!result.has(row.userId)) result.set(row.userId, row.specialId);
  return result;
}

export function normalizeSpecialId(value) {
  const code=String(value??"").trim().toUpperCase();
  if(!/^[A-Z0-9]{4,7}$/.test(code))throw new Error("SPECIAL_ID_MUST_BE_4_TO_7_CHARACTERS");
  return code;
}

export async function reconcileExpiredSpecialIds(db = prisma) {
  const now = new Date();
  const users = await db.user.findMany({ where: { OR: [
    { specialIds: { some: { status: { in: ["ACTIVE", "OWNED", "CLAIMED"] }, expiresAt: { lte: now } } } },
    { specialIds: { some: { status: "ACTIVE", revokedAt: { not: null } } } },
    { AND: [ { specialIds: { none: activeSpecialIdWhere(now) } }, { specialIds: { some: { ...occupiedSpecialId(now), status: { in: ["OWNED", "CLAIMED"] }, startsAt: { lte: now } } } } ] },
  ] }, select: { id: true }, take: 200, orderBy: { id: "asc" } });
  let count = 0;
  for (const user of users) count += (await reconcileUserSpecialIds(db, user.id))?.expired ?? 0;
  return { count };
}

export async function getEffectiveUserId(userId, publicId) {
  const assignment=await prisma.specialIdAssignment.findFirst({
    where:{userId,...activeSpecialIdWhere(new Date())},
    orderBy:{expiresAt:"desc"},
  });
  return {normalId:publicId,effectiveId:assignment?.specialId??publicId,specialId:assignment?.specialId??null,specialIdExpiresAt:assignment?.expiresAt??null};
}

export async function assignDefinitionToUser({publicId,definitionId,durationMinutes,source="ADMIN"}) {
  await reconcileExpiredSpecialIds();
  const user=await prisma.user.findUnique({where:{publicId}});
  if(!user || user.deletedAt) throw new Error("USER_NOT_FOUND");
  const definition=await prisma.specialIdDefinition.findUnique({where:{id:definitionId}});
  if(!definition) throw new Error("SPECIAL_ID_NOT_FOUND");
  if(!definition.active)throw new Error("SPECIAL_ID_IS_DISABLED");
  const occupied=await prisma.specialIdAssignment.findFirst({where:{definitionId,...occupiedSpecialId(new Date())}});
  if(occupied)throw new Error("SPECIAL_ID_ALREADY_ASSIGNED");
  const minutes=Number(durationMinutes||definition.defaultDurationMinutes);
  if(!Number.isInteger(minutes)||minutes<1)throw new Error("INVALID_SPECIAL_ID_DURATION");
  const assignment=await prisma.$transaction(async(tx)=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const now=new Date();
    const currentDefinition=await tx.specialIdDefinition.findUnique({where:{id:definitionId}});
    if(!currentDefinition?.active)throw new Error("SPECIAL_ID_IS_DISABLED");
    if(await tx.specialIdAssignment.findFirst({where:{specialId:{equals:definition.code,mode:'insensitive'},...occupiedSpecialId(new Date())}}))throw new Error('SPECIAL_ID_ALREADY_ASSIGNED');
    await retainActiveSpecialIds(tx,user.id,new Date());
    return tx.specialIdAssignment.create({data:{userId:user.id,definitionId:definition.id,specialId:definition.code,status:"ACTIVE",source,startsAt:now,expiresAt:new Date(now.getTime()+minutes*60000)}});
  });
  await publishSpecialIdentity(user.id,user.publicId,assignment);
  return assignment;
}

export async function autoAssignEligibleSpecialId(publicId, source) {
  await reconcileExpiredSpecialIds();
  const user=await prisma.user.findUniqueOrThrow({where:{publicId},include:{specialIds:{where:activeSpecialIdWhere(new Date()),take:1}}});
  if(user.specialIds.length)return user.specialIds[0];
  const definitions=await prisma.specialIdDefinition.findMany({where:{active:true,category:{in:["VIP","SVIP"]}},orderBy:[{minimumVipLevel:"desc"},{minimumTopUpAmount:"desc"},{createdAt:"asc"}]});
  for(const definition of definitions){
    const vipEligible=definition.minimumVipLevel!==null&&user.vipLevel>=definition.minimumVipLevel;
    const topUpEligible=definition.minimumTopUpAmount!==null&&user.totalTopUp>=definition.minimumTopUpAmount;
    if(!vipEligible&&!topUpEligible)continue;
    const occupied=await prisma.specialIdAssignment.findFirst({where:{definitionId:definition.id,...occupiedSpecialId(new Date())}});
    if(!occupied)return assignDefinitionToUser({publicId,definitionId:definition.id,source});
  }
  return null;
}
