import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({admin:{id:'admin',name:'Admin',role:'SUPER_ADMIN',active:true,permissions:[]},tx:{vipTier:{findUnique:vi.fn(),update:vi.fn()},auditLog:{create:vi.fn()}}}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:fn=>fn(m.tx)}}));
vi.mock('@/lib/portal-admin',()=>({requirePermission:async key=>{if(!hasPermission(m.admin,key))throw Object.assign(new Error('Forbidden'),{status:403});return m.admin;}}));
vi.mock('@/lib/vip-commerce',()=>({selectOwnedVip:vi.fn()}));
vi.mock('@/lib/props-store',()=>({syncProgressionProps:vi.fn()}));
vi.mock('@/lib/game-control/http',()=>({sameOrigin:vi.fn()}));
import {hasPermission} from './portal-permissions.js';
import {POST} from '../app/api/admin/vip/route.js';
beforeEach(()=>{vi.clearAllMocks();m.admin.role='SUPER_ADMIN';m.admin.permissions=[];m.tx.vipTier.findUnique.mockResolvedValue({id:'tier',active:true});m.tx.vipTier.update.mockResolvedValue({id:'tier'});});
const request=()=>new Request('https://portal.test/api/admin/vip',{method:'POST',body:JSON.stringify({action:'DELETE',id:'tier'})});
it('archives rather than revoking memberships or deleting history',async()=>{
 expect((await POST(request())).status).toBe(200);
 const data=m.tx.vipTier.update.mock.calls[0][0].data;
 expect(Object.keys(data)).toEqual(['archivedAt']);expect(data.archivedAt).toBeInstanceOf(Date);
 expect(m.tx.auditLog.create).toHaveBeenCalledOnce();
});
it('does not extend delete permission to delegated VIP managers',async()=>{
 m.admin.role='ADMIN';expect((await POST(request())).status).toBe(403);expect(m.tx.vipTier.update).not.toHaveBeenCalled();
});

it('permits explicitly delegated archive without revoking memberships',async()=>{m.admin.role='STAFF';m.admin.permissions=['vip.view','vip.delete'];expect((await POST(request())).status).toBe(200);expect(Object.keys(m.tx.vipTier.update.mock.calls[0][0].data)).toEqual(['archivedAt']);});
