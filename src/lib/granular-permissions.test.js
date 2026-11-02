import { expect,it } from 'vitest';
import { hasPermission,validatePermissions,expandPermissions,assignedPermissions } from './portal-permissions.js';
import { effectiveAdmin } from './portal-staff-state.js';
const staff=permissions=>({active:true,role:'STAFF',permissions});
it('separates read, create, edit, delete and export',()=>{
 const editor=staff(['tasks.view','tasks.edit']);
 expect(hasPermission(editor,'tasks.edit')).toBe(true);
 for(const key of ['tasks.create','tasks.delete','users.export'])expect(hasPermission(editor,key)).toBe(false);
 expect(hasPermission(staff(['users.view']),'users.export')).toBe(false);
 expect(hasPermission(staff(['users.view','users.export']),'users.export')).toBe(true);
});
it('preserves legacy actions without granting newly delegable destructive or export access',()=>{
 expect(expandPermissions(['tasks.manage'])).toContain('tasks.delete');
 expect(expandPermissions(['vip.manage'])).not.toContain('vip.delete');
 expect(expandPermissions(['agencies.manage'])).not.toContain('agencies.export');
 expect(assignedPermissions(['tasks.manage'])).not.toContain('tasks.manage');
});
it('requires view and prevents delegation escalation',()=>{
 const root={active:true,role:'SUPER_ADMIN'};
 expect(()=>validatePermissions(['tasks.edit'],root)).toThrow();
 expect(()=>validatePermissions(['tasks.view','tasks.delete'],staff(['tasks.view','tasks.edit']))).toThrow();
 expect(()=>validatePermissions(['database.view'],root)).toThrow();
});
it('revoking a manager action limits inherited legacy grants',async()=>{
 const rows={child:{id:'child',...staff(['tasks.view','tasks.manage']),createdById:'parent'},parent:{id:'parent',...staff(['tasks.view','tasks.edit'])}};
 const effective=await effectiveAdmin({admin:{findUnique:async({where})=>rows[where.id]}},'child');
 expect(hasPermission(effective,'tasks.edit')).toBe(true);expect(hasPermission(effective,'tasks.delete')).toBe(false);
});
