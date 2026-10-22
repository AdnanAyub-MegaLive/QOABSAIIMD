import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({purchase:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/special-id-commerce',()=>({purchaseSpecialId:mocks.purchase,occupiedSpecialId:()=>({})}));
vi.mock('@/lib/rate-limit',()=>({isRateLimited:()=>false}));
vi.mock('@/lib/mobile-api',()=>({requireMobileUser:async()=>({id:'qa'}),mobileOptions:()=>new Response(null),mobileJson:(body,status=200)=>Response.json(body,{status}),mobileApiError:(_e,code)=>Response.json({success:false,error:{code,message:'Unable to complete this request right now.'}},{status:500})}));
import {POST} from '../app/api/store/special-ids/route.js';
afterEach(()=>{delete globalThis.portalScheduleSpecialIdExpiry;vi.restoreAllMocks();});
const request=()=>new Request('https://portal.test/api/store/special-ids',{method:'POST',headers:{'Idempotency-Key':'request-123'},body:JSON.stringify({definitionId:'d'})});
it('returns committed purchase success despite scheduler failure',async()=>{
 const data={assignmentId:'a',specialId:'QAID',coinBalance:'80',expiresAt:'2026-11-01T00:00:00Z'};
 mocks.purchase.mockResolvedValue(data);globalThis.portalScheduleSpecialIdExpiry=async()=>{throw Error('scheduler unavailable');};
 vi.spyOn(console,'error').mockImplementation(()=>{});
 const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toEqual({success:true,data});
});
it('preserves specific transaction conflict responses',async()=>{
 mocks.purchase.mockRejectedValue({code:'SPECIAL_ID_PURCHASE_BUSY',status:409,message:'Retry with the same Idempotency-Key.'});
 const response=await POST(request());expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('SPECIAL_ID_PURCHASE_BUSY');
});
it('logs unexpected failures and returns a stable error envelope',async()=>{
 mocks.purchase.mockRejectedValue(Error('internal detail'));const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const response=await POST(request());expect(response.status).toBe(500);expect((await response.json()).error.code).toBe('SPECIAL_ID_PURCHASE_FAILED');expect(log).toHaveBeenCalled();
});
