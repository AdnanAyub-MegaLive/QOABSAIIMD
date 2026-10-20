import {expect,it,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({permission:vi.fn(),findMany:vi.fn()}));
vi.mock('@/lib/portal-admin',()=>({requirePermission:mocks.permission}));
vi.mock('@/lib/prisma',()=>({prisma:{auditLog:{findMany:mocks.findMany}}}));
import {GET} from '../app/api/admin/audit-logs/route.js';
beforeEach(()=>{vi.clearAllMocks();mocks.permission.mockResolvedValue({id:'admin'});});
it('denies export without audit permission before querying records',async()=>{
 mocks.permission.mockRejectedValue(Object.assign(new Error('Denied'),{status:403,code:'FORBIDDEN'}));
 expect((await GET(new Request('https://portal.test/api/admin/audit-logs'))).status).toBe(403);
 expect(mocks.findMany).not.toHaveBeenCalled();
});
it('exports bounded redacted data and never caches it',async()=>{
 mocks.findMany.mockResolvedValue([{id:'1',createdAt:new Date(0),description:'Updated',metadata:{password:'hidden'}}]);
 const res=await GET(new Request('https://portal.test/api/admin/audit-logs?category=FINANCE'));
 expect(res.headers.get('cache-control')).toBe('no-store');
 expect((await res.json()).data.items[0].details.password).toBe('[REDACTED]');
 expect(mocks.permission).toHaveBeenCalledWith('audit.view');
 expect(mocks.findMany.mock.lastCall[0]).toMatchObject({take:501,where:{category:'FINANCE'}});
});
