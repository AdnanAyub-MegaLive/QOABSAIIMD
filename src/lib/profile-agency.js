export async function profileAgency(db, userId, memberAgency) {
  const agency = memberAgency?.status === "ACTIVE" ? memberAgency
    : await db.agency.findFirst({ where:{ownerUserId:userId,status:"ACTIVE"}, orderBy:[{createdAt:"asc"},{id:"asc"}] });
  if (!agency) return null;
  const owner = agency.ownerUserId ? await db.user.findUnique({where:{id:agency.ownerUserId},select:{publicId:true}}) : null;
  return {...agency,isOwner:agency.ownerUserId===userId,ownerPublicId:owner?.publicId??null};
}
