import { expect,it,vi } from 'vitest';
import { personalPrivileges,updatePersonalPrivilege } from './personal-privileges.js';
import { vipCapabilities,activeVipWhere } from './vip-capabilities.js';
const row=()=>({startsAt:new Date(0),expiresAt:new Date(Date.now()+60000),disabledPrivileges:['ANTI_KICK'],tier:{active:true,level:3,privileges:['ANTI_KICK','INVISIBLE_ENTRY','LEVEL_BOOST'],xpMultiplierBps:15000}});
it('keeps disabled benefits visible but excludes them from enforcement',()=>{
 expect(personalPrivileges(row()).items.find(p=>p.key==='ANTI_KICK').enabled).toBe(false);
 expect(vipCapabilities(row()).vipPrivileges).toEqual(['INVISIBLE_ENTRY','LEVEL_BOOST']);
 expect(activeVipWhere('INVISIBLE_ENTRY').NOT).toEqual({disabledPrivileges:{has:'INVISIBLE_ENTRY'}});
});
it('rejects unsupported keys and ungranted benefits',async()=>{
 const tx={ $queryRaw:vi.fn(),vipMembership:{findUnique:async()=>row(),update:vi.fn()} };
 const db={$transaction:fn=>fn(tx)};
 await expect(updatePersonalPrivilege(db,'u','ADMIN',true)).rejects.toMatchObject({status:422});
 await expect(updatePersonalPrivilege(db,'u','FORBIDDEN_FOLLOW',true)).rejects.toMatchObject({status:403});
 expect(tx.vipMembership.update).not.toHaveBeenCalled();
});
it('can restore a granted disabled benefit',async()=>{
 const tx={$queryRaw:vi.fn(),vipMembership:{findUnique:async()=>row(),update:async({data})=>({...row(),...data})}};
 const result=await updatePersonalPrivilege({$transaction:fn=>fn(tx)},'u','ANTI_KICK',true);
 expect(result.items.find(p=>p.key==='ANTI_KICK').enabled).toBe(true);
});
it('expired memberships expose no switches',()=>{expect(personalPrivileges({...row(),expiresAt:new Date(0)}).items).toEqual([])});
