import { VIP_PRIVILEGES, vipIsActive } from './vip-contract.js';
export const switchablePrivileges = new Set(['ANTI_KICK','ANTI_MIC_BAN','ROOM_ANTI_LOCK','INVISIBLE_ENTRY','FORBIDDEN_FOLLOW','RANKING_PRIORITY','LEVEL_BOOST','GIF_ROOM_COVER','CUSTOMER_SERVICE','HIGHLIGHT_NAME','VIEW_VISITORS']);
export function personalPrivileges(row) {
  if (!vipIsActive(row)) return { items: [] };
  return { items: VIP_PRIVILEGES.filter(p => row.tier.privileges.includes(p.key)).map(p => ({
    key: p.key, label: p.label, enabled: !(row.disabledPrivileges ?? []).includes(p.key),
    switchable: switchablePrivileges.has(p.key),
    description: switchablePrivileges.has(p.key) ? 'Choose whether to use this benefit.' : 'Manage this benefit through VIP or your owned items.',
  })) };
}
export async function updatePersonalPrivilege(db, userId, key, enabled) {
  if (!switchablePrivileges.has(key) || typeof enabled !== 'boolean') throw Object.assign(new Error('Choose a supported privilege.'), {status:422,code:'VALIDATION_ERROR'});
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "userId" FROM "VipMembership" WHERE "userId" = ${userId} FOR UPDATE`;
    const row=await tx.vipMembership.findUnique({where:{userId},include:{tier:true}});
    if (!vipIsActive(row) || !row.tier.privileges.includes(key)) throw Object.assign(new Error('This privilege is unavailable.'),{status:403,code:'PRIVILEGE_UNAVAILABLE'});
    const disabled=new Set(row.disabledPrivileges ?? []);
    if(enabled)disabled.delete(key);else disabled.add(key);
    const saved=await tx.vipMembership.update({where:{userId},data:{disabledPrivileges:[...disabled]},include:{tier:true}});
    return personalPrivileges(saved);
  });
}
