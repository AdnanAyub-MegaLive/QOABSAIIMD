import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),resolve:vi.fn()}));
vi.mock('./prisma',()=>({prisma:{}}));
vi.mock('./mobile-api',()=>({
  requireMobileUser:mocks.auth,
  mobileJson:async body=>Response.json(body),
  mobileApiError:error=>Response.json({success:false,error:{code:error.code}},{status:error.code==='VALIDATION_ERROR'?422:401}),
}));
vi.mock('./gift-resolution',()=>({resolveGiftRequests:mocks.resolve}));
vi.mock('./mobile-v1',()=>({
  v1Options:()=>new Response(null,{status:204}),
  withV1Request:async(request,options,fn)=>{
    const response=await fn();response.headers.set('Cache-Control','no-store, max-age=0');return response;
  },
}));
import { POST } from '../app/api/v1/gifts/resolve/route.js';
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({id:'authenticated-sender'});mocks.resolve.mockResolvedValue({results:[]});});
const request=body=>new Request('https://portal.test/api/v1/gifts/resolve',{method:'POST',body:JSON.stringify(body)});
it('resolves for the authenticated sender without a room or client-supplied owner',async()=>{
  const response=await POST(request({requestIds:['request-1'],senderId:'other-user'}));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(mocks.resolve.mock.calls[0][1]).toBe('authenticated-sender');
  expect(await response.json()).toEqual({success:true,data:{results:[]}});
});
it('does not access gift records when session validation fails',async()=>{
  mocks.auth.mockRejectedValueOnce(Object.assign(Error('session'),{code:'INVALID_SESSION'}));
  expect((await POST(request({requestIds:['request-1']}))).status).toBe(401);
  expect(mocks.resolve).not.toHaveBeenCalled();
});
it('rejects malformed JSON before resolution',async()=>{
  const response=await POST(new Request('https://portal.test/api/v1/gifts/resolve',{method:'POST',body:'{'}));
  expect(response.status).toBe(422);expect(mocks.resolve).not.toHaveBeenCalled();
});
