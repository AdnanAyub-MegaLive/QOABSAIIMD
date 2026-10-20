import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({db:{},backgrounds:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:m.db}));
vi.mock('@/lib/mobile-api',()=>({requireMobileUser:async()=>({id:'owner'}),mobileOptions:()=>new Response(null),mobileJson:(body,status=200)=>Response.json(body,{status}),mobileApiError:()=>Response.json({success:false},{status:500})}));
vi.mock('@/lib/user-perks',()=>({requestOrigin:r=>new URL(r.url).origin,resolveUserPerks:async()=>new Map()}));
import {GET as dashboard} from '../app/api/agencies/mine/route.js';
import {GET as browse} from '../app/api/agencies/route.js';
import {GET as salary} from '../app/api/agencies/mine/salary/route.js';
beforeEach(()=>{
 vi.stubEnv('AUTH_SECRET','test-only');vi.stubEnv('MOBILE_API_BASE_URL','');vi.stubEnv('AUTH_URL','');
 const agency={id:'a',publicId:'AGN-1',name:'Test Agency',status:'ACTIVE',country:'PK',bd:null,createdAt:new Date(),commissionCoinBalance:0n,monthlyTargetCoins:0n,userHosts:[],talents:[],joinRequests:[],_count:{userHosts:0}};
 Object.assign(m.db,{agency:{findMany:async({select})=>[Object.fromEntries(Object.keys(select).map(key=>[key,agency[key]]))],findFirst:async()=>agency,findUniqueOrThrow:async()=>agency},user:{aggregate:async()=>({_sum:{totalTopUp:0n}})},giftSettlement:{aggregate:async()=>({_sum:{grossCoins:0n,hostSalaryCoins:0n}}),findMany:async()=>[]},$queryRaw:async()=>[],videoLiveSession:{findMany:async()=>[]},liveSession:{findMany:async()=>[]},agencySalaryPolicy:{findUnique:async()=>null},activityLevelRule:{findUnique:async()=>({levels:[{level:0,threshold:'0'}],enabled:true,revision:1})},activityLevelAward:{aggregate:async()=>({_sum:{xp:0n}})},levelTagBackground:{findMany:m.backgrounds}});
 m.backgrounds.mockReset().mockImplementation(async({where})=>[
  {track:'AGENCY',level:0,asset:{publicId:'AST-agency',mimeType:'image/png',mediaVersion:'abc'}},
  {track:'USER',level:11,asset:{publicId:'AST-unrelated',mimeType:'image/png',mediaVersion:'def'}},
 ].filter(row=>!where.OR||where.OR.some(s=>s.track===row.track&&s.level===row.level)));
});
afterEach(()=>vi.unstubAllEnvs());
it('includes the owner agency logo as a public display URL',async()=>{
 const original=m.db.agency.findFirst;
 m.db.agency.findFirst=async()=>({...await original(),logoAssetPublicId:'AST-logo'});
 m.db.uploadAsset={findFirst:async()=>({publicId:'AST-logo',mediaVersion:'abc123'})};
 const response=await dashboard(new Request('https://portal.test/api/agencies/mine'));
 expect(response.status).toBe(200);
 const json=await response.json();
 expect(json.data.agency.logoUrl).toContain('/api/uploads/AST-logo/file?');
 expect(json.data.agency.logoUrl).toContain('displaySig=');
 expect(json.data.agency.logoUrl).toContain('v=abc123');
});
it.each([['dashboard',dashboard,'/api/agencies/mine'],['browse',browse,'/api/agencies'],['salary',salary,'/api/agencies/mine/salary']])('returns 200 for %s with stored level-background fixtures',async(name,handler,path)=>{
 const response=await handler(new Request('https://portal.test'+path));
 expect(response.status).toBe(200);const json=await response.json();expect(json.success).toBe(true);
 expect(m.backgrounds).toHaveBeenCalledWith(expect.objectContaining({where:{asset:{active:true},OR:[{track:'AGENCY',level:0}]}}));
 if(name!=='browse')expect((name==='dashboard'?json.data.agency:json.data).progression.background.url).toMatch(/^https:\/\/portal.test\/api\/uploads\/AST-agency\/file\?/);
});
