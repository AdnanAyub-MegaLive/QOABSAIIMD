import { VIP_PRIVILEGES, vipIsActive } from './vip-contract.js';
export const switchablePrivileges = new Set(['ANTI_KICK','ANTI_MIC_BAN','ROOM_ANTI_LOCK','INVISIBLE_ENTRY','FORBIDDEN_FOLLOW','RANKING_PRIORITY','LEVEL_BOOST','GIF_ROOM_COVER','CUSTOMER_SERVICE','HIGHLIGHT_NAME','VIEW_VISITORS']);
/** Staff-granted privileges, listed even without VIP; the user can switch them off. */
function grantedItems(user, skip = []) {
  return VIP_PRIVILEGES.filter(p => (user?.grantedPrivileges ?? []).includes(p.key) && !skip.includes(p.key)).map(p => ({
    key: p.key, label: p.label, enabled: !(user.disabledGrantedPrivileges ?? []).includes(p.key), switchable: true, description: 'Granted by Mega Live staff. Choose whether to use it.',
  }));
}
export function personalPrivileges(row, user = null) {
  if (!vipIsActive(row)) return { items: grantedItems(user) };
  const vipKeys = row.tier.privileges ?? [];
  return { items: [...VIP_PRIVILEGES.filter(p => row.tier.privileges.includes(p.key)).map(p => ({
    key: p.key, label: p.label, enabled: !(row.disabledPrivileges ?? []).includes(p.key),
    switchable: switchablePrivileges.has(p.key),
    description: switchablePrivileges.has(p.key) ? 'Choose whether to use this benefit.' : 'Manage this benefit through VIP or your owned items.',
  })), ...grantedItems(user, vipKeys)] };
}
export async function updatePersonalPrivilege(db, userId, key, enabled) {
  if (!switchablePrivileges.has(key) || typeof enabled !== 'boolean') throw Object.assign(new Error('Choose a supported privilege.'), {status:422,code:'VALIDATION_ERROR'});
  return db.$transaction(async tx => {
    const user=await tx.user?.findUnique?.({where:{id:userId},select:{grantedPrivileges:true,disabledGrantedPrivileges:true}});
    if ((user?.grantedPrivileges ?? []).includes(key)) {
      const off=new Set(user.disabledGrantedPrivileges ?? []);
      if(enabled)off.delete(key);else off.add(key);
      const saved=await tx.user.update({where:{id:userId},data:{disabledGrantedPrivileges:[...off]},select:{grantedPrivileges:true,disabledGrantedPrivileges:true}});
      const vip=await tx.vipMembership.findUnique({where:{userId},include:{tier:true}});
      // Keep a VIP copy of the same privilege in step with the user's choice.
      if (vipIsActive(vip) && vip.tier.privileges.includes(key)) { const d=new Set(vip.disabledPrivileges ?? []); if(enabled)d.delete(key);else d.add(key); await tx.vipMembership.update({where:{userId},data:{disabledPrivileges:[...d]}}); }
      return personalPrivileges(await tx.vipMembership.findUnique({where:{userId},include:{tier:true}}), saved);
    }
    await tx.$queryRaw`SELECT "userId" FROM "VipMembership" WHERE "userId" = ${userId} FOR UPDATE`;
    const row=await tx.vipMembership.findUnique({where:{userId},include:{tier:true}});
    if (!vipIsActive(row) || !row.tier.privileges.includes(key)) throw Object.assign(new Error('This privilege is unavailable.'),{status:403,code:'PRIVILEGE_UNAVAILABLE'});
    const disabled=new Set(row.disabledPrivileges ?? []);
    if(enabled)disabled.delete(key);else disabled.add(key);
    const saved=await tx.vipMembership.update({where:{userId},data:{disabledPrivileges:[...disabled]},include:{tier:true}});
    return personalPrivileges(saved, user);
  });
}
