import {it,expect,vi} from 'vitest';
const transfer=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/agency-wallet-transfer',()=>({transferToAgencyOwner:transfer}));
vi.mock('@/lib/mobile-api',()=>({requireMobileUser:async()=>({id:'host'}),mobileJson:(body,status=200)=>Response.json(body,{status}),mobileApiError:()=>Response.json({success:false},{status:500})}));
vi.mock('@/lib/mobile-v1',()=>({v1Options:()=>{},withV1Request:(_r,_o,fn)=>fn()}));
import {POST} from '../app/api/v1/wallet/agency-transfer/route.js';
it.each(['QUOTE_CHANGED','RECIPIENT_UNAVAILABLE'])('returns recoverable %s to the mobile wallet',async code=>{
 transfer.mockRejectedValue(Object.assign(new Error('Refresh wallet'),{code,status:409}));
 const r=await POST(new Request('https://portal.test/api/v1/wallet/agency-transfer',{method:'POST',body:'{}'}));
 expect(r.status).toBe(409);expect((await r.json()).error.code).toBe(code);
});
it('rejects malformed JSON as a definitive client error',async()=>{const r=await POST(new Request('https://portal.test/api/v1/wallet/agency-transfer',{method:'POST',body:'{'}));expect(r.status).toBe(400);});
