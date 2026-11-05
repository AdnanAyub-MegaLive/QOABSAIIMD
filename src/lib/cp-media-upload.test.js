import { beforeEach, it, expect, vi } from 'vitest';
import sharp from 'sharp';
const mocks = vi.hoisted(()=>({permission:vi.fn(),create:vi.fn(),audit:vi.fn(),find:vi.fn()}));
vi.mock('@/lib/portal-admin',()=>({requirePermission:mocks.permission}));
vi.mock('@/lib/game-control/http',()=>({sameOrigin:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({isRateLimited:()=>false}));
vi.mock('@/lib/user-perks',()=>({requestOrigin:()=> 'https://portal.example'}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:fn=>fn({uploadAsset:{create:mocks.create},auditLog:{create:mocks.audit}}),uploadAsset:{findFirst:mocks.find}}}));
vi.mock('@/lib/upload-assets',()=>({createPublicDisplayAssetUrl:()=> 'https://portal.example/signed-file'}));
import { POST } from '../app/api/admin/cp-levels/media/route.js';
import { GET } from '../app/api/cp-media/[assetId]/route.js';
beforeEach(()=>{vi.clearAllMocks();mocks.permission.mockResolvedValue({id:'admin'});mocks.create.mockImplementation(async({data})=>data);});
function request(bytes,name,type,purpose='image') {const form=new FormData();form.set('file',new File([bytes],name,{type}));form.set('purpose',purpose);return new Request('https://portal.example/api/admin/cp-levels/media',{method:'POST',body:form});}
it('uploads decoded image with a permanent reference and detected format',async()=>{
 const bytes=await sharp({create:{width:2,height:2,channels:4,background:'#ff66aa'}}).png().toBuffer();
 const response=await POST(request(bytes,'badge.png','image/png'));const result=await response.json();
 expect(response.status).toBe(200);expect(result.data.mimeType).toBe('image/webp');expect(result.data.url).toMatch(/^https:\/\/portal.example\/api\/cp-media\/AST-/);
 expect(mocks.permission).toHaveBeenCalledWith('cp.edit');expect(mocks.create.mock.calls[0][0].data).toMatchObject({category:'CP_MEDIA',active:true,storeVisible:false});expect(mocks.audit).toHaveBeenCalledOnce();
});
it.each([['image','fake.png','image/png'],['animation','fake.mp4','video/mp4'],['animation','fake.svga','application/svga']])('rejects fake %s contents in %s',async(purpose,name,type)=>{const response=await POST(request('<script>bad</script>',name,type,purpose));expect(response.status).toBe(422);expect(mocks.create).not.toHaveBeenCalled();});
it('rejects uploads without CP editing permission',async()=>{mocks.permission.mockRejectedValue(Object.assign(Error('Forbidden'),{status:403}));expect((await POST(request('x','x.png','image/png'))).status).toBe(403);expect(mocks.create).not.toHaveBeenCalled();});
it('resolves only active CP media and never caches an expiring redirect',async()=>{mocks.find.mockResolvedValue({publicId:'AST-1'});const response=await GET(new Request('https://portal.example/api/cp-media/AST-1'),{params:Promise.resolve({assetId:'AST-1'})});expect(response.status).toBe(307);expect(response.headers.get('cache-control')).toBe('no-store');expect(mocks.find.mock.calls[0][0].where).toEqual({publicId:'AST-1',category:'CP_MEDIA',active:true});mocks.find.mockResolvedValue(null);expect((await GET(new Request('https://portal.example/api/cp-media/AST-2'),{params:Promise.resolve({assetId:'AST-2'})})).status).toBe(404);});
