import { beforeEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),snapshot:vi.fn(),limited:vi.fn()}));
vi.mock('./prisma',()=>({prisma:{}}));
vi.mock('./mobile-api',()=>({requireMobileUser:mocks.auth,mobileOptions:()=>new Response(null,{status:204}),mobileJson:(body,status=200)=>Response.json(body,{status}),mobileApiError:()=>Response.json({success:false},{status:401})}));
vi.mock('./room-rankings',()=>({requireRankingRoom:mocks.access}));
vi.mock('./confirmed-realtime',()=>({roomGiftTotalsSnapshot:mocks.snapshot}));
vi.mock('./rate-limit',()=>({isRateLimited:mocks.limited}));
import { GET } from '../app/api/audio-rooms/[roomId]/gift-totals/route.js';
import { GET as alias } from '../app/api/v1/audio-rooms/[roomId]/gift-totals/route.js';
const run=()=>GET(new Request('https://portal.test/api/audio-rooms/R/gift-totals'),{params:Promise.resolve({roomId:'R'})});
beforeEach(()=>{vi.resetAllMocks();mocks.auth.mockResolvedValue({id:'viewer'});mocks.snapshot.mockResolvedValue({roomId:'R',roomTotalCoins:'0',roomTotalsRevision:'0',recipients:[]})});
test('empty snapshot is successful, private and uses same v1 handler',async()=>{
  expect(alias).toBe(GET);const r=await run();expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('private, no-store');expect((await r.json()).data.roomTotalCoins).toBe('0');
  expect(mocks.access).toHaveBeenCalledWith({},'R',{id:'viewer'});
});
test('auth and room access failures never read totals',async()=>{
  mocks.auth.mockRejectedValueOnce(new Error('INVALID_SESSION'));expect((await run()).status).toBe(401);
  mocks.access.mockRejectedValueOnce({status:403,code:'JOIN_ROOM_FIRST',message:'Join first'});expect((await run()).status).toBe(403);
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
test('rate limits and missing schema do not become zero snapshots',async()=>{
  mocks.limited.mockReturnValueOnce(true);expect((await run()).status).toBe(429);
  mocks.snapshot.mockRejectedValueOnce({code:'P2021'});expect((await run()).status).toBe(503);
});
