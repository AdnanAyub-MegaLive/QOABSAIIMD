import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),find:vi.fn()}));
vi.mock('../../auth',()=>({auth:mocks.auth}));
vi.mock('./prisma',()=>({prisma:{admin:{findUnique:mocks.find}}}));
vi.mock('next/navigation',()=>({redirect:vi.fn()}));
import { requirePermission } from './portal-admin.js';
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({user:{id:'staff',sessionVersion:1}});});
it('rechecks stored permissions on each request from an existing session',async()=>{
 const admin={id:'staff',active:true,role:'STAFF',sessionVersion:1,permissions:['messages.view']};mocks.find.mockImplementation(async()=>admin);
 await expect(requirePermission('messages.view')).resolves.toMatchObject({id:'staff'});
 admin.permissions=['users.view'];await expect(requirePermission('messages.view')).rejects.toMatchObject({status:403});
});
it('rejects old sessions immediately after a staff edit revokes them',async()=>{
 mocks.find.mockResolvedValue({id:'staff',active:true,role:'STAFF',sessionVersion:2,permissions:['messages.view']});
 await expect(requirePermission('messages.view')).rejects.toMatchObject({status:401});
});
it('denies mutations to view-only staff even if they call the API directly',async()=>{
 mocks.find.mockResolvedValue({id:'staff',active:true,role:'STAFF',sessionVersion:1,permissions:['tasks.view']});
 for(const action of ['create','edit','delete'])await expect(requirePermission(`tasks.${action}`)).rejects.toMatchObject({status:403});
});
