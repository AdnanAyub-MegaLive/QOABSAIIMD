import { beforeEach, expect, it, vi } from 'vitest';
import { hasPermission } from './portal-permissions.js';
const m=vi.hoisted(()=>({admin:null,change:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/portal-admin',()=>({
 requirePortalAdmin:async()=>m.admin,
 portalPermissionError:async permission=>hasPermission(m.admin,permission)?null:Response.json({success:false},{status:403}),
}));
vi.mock('@/lib/room-banners',()=>({bannerSettings:vi.fn(),ownerBanner:vi.fn(),validateBannerSettings:vi.fn(),changeBanner:m.change,editBannerText:vi.fn()}));
import { PATCH } from '../app/api/admin/room-banners/route.js';
beforeEach(()=>{vi.clearAllMocks();m.change.mockResolvedValue({id:'banner'});});
const request=action=>new Request('https://portal.test/api/admin/room-banners',{method:'PATCH',body:JSON.stringify({action,bannerId:'banner',roomId:'room'})});
it('view-only staff cannot approve or remove banners',async()=>{
 m.admin={id:'reader',active:true,role:'STAFF',permissions:['appearance.view']};
 for(const action of ['APPROVE','DELETE'])expect((await PATCH(request(action))).status).toBe(403);
 expect(m.change).not.toHaveBeenCalled();
});
it('edit-only staff can review but cannot delete',async()=>{
 m.admin={id:'editor',active:true,role:'STAFF',permissions:['appearance.view','appearance.edit']};
 expect((await PATCH(request('DELETE'))).status).toBe(403);expect(m.change).not.toHaveBeenCalled();
 expect((await PATCH(request('APPROVE'))).status).toBe(200);
});
it('delete access permits removal without granting approval access',async()=>{
 m.admin={id:'remover',active:true,role:'STAFF',permissions:['appearance.view','appearance.delete']};
 expect((await PATCH(request('APPROVE'))).status).toBe(403);
 expect((await PATCH(request('DELETE'))).status).toBe(200);
 expect(m.change).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({action:'DELETE',adminId:'remover'}));
});
