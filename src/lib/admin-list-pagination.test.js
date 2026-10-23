import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),admin:vi.fn(),refunds:vi.fn(),refundCount:vi.fn(),videos:vi.fn(),videoCount:vi.fn()}));
vi.mock('@/lib/portal-admin',()=>({requirePermission:m.permission,portalPermissionError:m.permission,requirePortalAdmin:m.admin}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:async values=>Promise.all(values),giftRefund:{findMany:m.refunds,count:m.refundCount},videoLiveSession:{findMany:m.videos,count:m.videoCount}}}));
vi.mock('@/lib/gift-refunds',()=>({previewGiftRefund:vi.fn(),refundGift:vi.fn()}));
vi.mock('@/lib/game-control/http',()=>({sameOrigin:vi.fn(),jsonBody:vi.fn()}));
vi.mock('@/lib/progression',()=>({jsonSafe:x=>x}));
vi.mock('@/lib/realtime',()=>({emitToVideoLive:vi.fn()}));
import {GET as refunds} from '../app/api/admin/gift-refunds/route.js';
import {GET as videos} from '../app/api/admin/live-video/route.js';
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue(null);m.admin.mockResolvedValue({id:'admin'});m.refunds.mockResolvedValue([]);m.refundCount.mockResolvedValue(151);m.videos.mockResolvedValue([]);m.videoCount.mockResolvedValue(250);});
it('refund history reaches beyond the old 100-row cap with stable ordering',async()=>{
 const r=await refunds(new Request('https://portal.test/api/admin/gift-refunds?page=3'));
 expect((await r.json()).data).toEqual({items:[],page:3,pageSize:50,total:151});
 expect(m.refunds).toHaveBeenCalledWith({orderBy:[{createdAt:'desc'},{giftId:'desc'}],skip:100,take:50});
});
it('video filtering is applied before pagination and totals',async()=>{
 const r=await videos(new Request('https://portal.test/api/admin/live-video?page=5&status=LIVE'));
 expect((await r.json()).data.total).toBe(250);
 expect(m.videos).toHaveBeenCalledWith(expect.objectContaining({where:{status:'LIVE'},skip:200,take:50}));
 expect(m.videoCount).toHaveBeenCalledWith({where:{status:'LIVE'}});
});
it('video permission denial never reads records',async()=>{
 m.permission.mockResolvedValue(new Response(null,{status:403}));
 expect((await videos(new Request('https://portal.test/api/admin/live-video'))).status).toBe(403);expect(m.videos).not.toHaveBeenCalled();
});
it.each(['-2','NaN','1.5'])('normalizes page %s safely',async page=>{
 await refunds(new Request(`https://portal.test/api/admin/gift-refunds?page=${page}`));expect(m.refunds).toHaveBeenCalledWith(expect.objectContaining({skip:0,take:50}));
});
