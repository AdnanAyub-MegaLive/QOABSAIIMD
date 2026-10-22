import {beforeEach, expect, it, vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),origin:vi.fn(),notify:vi.fn(),db:{},asset:null,update:vi.fn(),audit:vi.fn()}));
vi.mock('../../auth',()=>({auth:async()=>({user:{name:'Admin'}})}));
vi.mock('@/lib/prisma',()=>({prisma:m.db}));
vi.mock('@/lib/portal-admin',()=>({portalPermissionError:m.permission}));
vi.mock('@/lib/game-control/http',()=>({sameOrigin:m.origin}));
vi.mock('@/lib/gift-catalog-version',()=>({notifyGiftCatalogUpdated:m.notify}));
import {DELETE} from '../app/api/uploads/route.js';
const request=()=>new Request('https://portal.test/api/uploads',{method:'DELETE',body:JSON.stringify({assetId:'AST-test',reason:'Retired'})});
beforeEach(()=>{
 vi.clearAllMocks();m.permission.mockResolvedValue(null);
 m.asset={id:'asset',name:'Frame',category:'FRAMES',archivedAt:null,_count:{assignments:3}};
 Object.assign(m.db,{$queryRaw:vi.fn(),$transaction:fn=>fn(m.db),uploadAsset:{findUniqueOrThrow:async()=>m.asset,update:m.update},auditLog:{create:m.audit}});
});
it('archives without deleting media, ownership, balances or history',async()=>{
 expect((await DELETE(request())).status).toBe(200);
 expect(m.update).toHaveBeenCalledWith({where:{id:'asset'},data:{archivedAt:expect.any(Date),storeVisible:false}});
 expect(m.audit.mock.calls[0][0].data.metadata.preservedAssignments).toBe(3);
});
it('repeated archive leaves the original archive and audit unchanged',async()=>{
 m.asset.archivedAt=new Date();expect((await DELETE(request())).status).toBe(200);
 expect(m.update).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
it('requires delete permission',async()=>{
 m.permission.mockResolvedValue(Response.json({}, {status:403}));
 expect((await DELETE(request())).status).toBe(403);expect(m.update).not.toHaveBeenCalled();
});
it('accepts the dedicated controls ID contract',async()=>{
 const r=new Request('https://portal.test/api/uploads',{method:'DELETE',body:JSON.stringify({id:'AST-test',reason:'Retired'})});
 expect((await DELETE(r)).status).toBe(200);expect(m.update).toHaveBeenCalledOnce();
});
it.each(['GIFTS','LIVE_GIFTS','BANNERS','MUSIC_TRACKS','AGENCY_ARTWORK','VIP_STICKERS','CAMPAIGN_WIDGETS','APK','GAME_ICONS'])('archives %s without revoking existing access',async category=>{
 m.asset.category=category;expect((await DELETE(request())).status).toBe(200);
 expect(m.update.mock.calls[0][0].data).toEqual({archivedAt:expect.any(Date),storeVisible:false});
 expect(m.db.$queryRaw).toHaveBeenCalledOnce();
});
