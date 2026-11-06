const periodMs = 30 * 86400000;
export const nextCpReview = date => new Date(date.getTime() + periodMs);

// Called with the relationship locked. Gifts and the periodic worker use the same boundary.
export async function settleCpMaintenance(tx, row, levels, now = new Date()) {
  if (!row.maintenanceDueAt || row.maintenanceDueAt > now || row.status !== 'ACTIVE') return row;
  const enabled = levels.filter(level => level.enabled).sort((a,b) => a.level - b.level);
  let due = row.maintenanceDueAt;
  let exp = row.exp;
  let coins = row.maintenanceCoins;
  let status = row.status;
  let level = 0;
  let expiresAt = row.expiresAt;
  while (due <= now) {
    const current = enabled.filter(setting => setting.minExp <= exp).at(-1);
    level = current?.level ?? 0;
    const target = current?.maintenanceMinCoins ?? enabled.find(setting => setting.level === 1)?.maintenanceMinCoins ?? 0n;
    const missed = coins === 0n || coins < target;
    if (level <= 1 && missed) {
      status = 'EXPIRED';
      expiresAt = due;
      due = null;
      break;
    }
    if (level > 1 && missed) {
      const lower = enabled.filter(setting => setting.level < level).at(-1);
      level = lower?.level ?? 0;
      exp = lower?.minExp ?? 0n;
    }
    coins = 0n;
    due = nextCpReview(due);
  }
  return tx.profileRelationship.update({where:{id:row.id}, data:{
    level, exp, status, expiresAt, maintenanceCoins:coins, maintenanceDueAt:due,
  }});
}

export async function reviewDueCp(tx, id, now) {
  await tx.$queryRaw`SELECT id FROM "ProfileRelationship" WHERE id=${id} FOR UPDATE`;
  const row = await tx.profileRelationship.findUnique({where:{id}});
  if (row?.status !== 'ACTIVE' || !row.maintenanceDueAt || row.maintenanceDueAt > now) return row;
  return settleCpMaintenance(tx, row, await tx.cpLevel.findMany(), now);
}

export async function maintainCpRelationships(db, now = new Date()) {
  const candidates = await db.profileRelationship.findMany({
    where:{type:'CP',status:'ACTIVE',maintenanceDueAt:{lte:now}},
    select:{id:true}, orderBy:[{maintenanceDueAt:'asc'},{id:'asc'}], take:250,
  });
  for (const {id} of candidates) {
    await db.$transaction(tx => reviewDueCp(tx, id, now));
  }
}
