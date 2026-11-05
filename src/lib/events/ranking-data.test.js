import { describe,it,expect,vi } from 'vitest';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('../user-perks.js',()=>({resolveUserPerks:async()=>new Map()}));
vi.mock('../avatar-history.js',()=>({avatarDisplayUrl:value=>value}));
import { eventRankings } from './ranking-data.js';
describe('ranking data',()=>{
  it.each(['wealth','charm','agency','cp','game'])('builds parameterized %s ranking with refund and privacy filters',async type=>{
    const db={$queryRaw:vi.fn().mockResolvedValue([]),user:{findMany:vi.fn().mockResolvedValue([])}};
    const result=await eventRankings({type,period:'today',offset:0,q:"' OR 1=1",viewerId:'viewer',origin:'https://portal.example'},db);
    const query=db.$queryRaw.mock.calls[0][0];
    expect(query.sql).toContain('"reversedAt" IS NULL');expect(query.sql).toContain('"UserBlock"');expect(query.sql).not.toContain("' OR 1=1");expect(query.values).toContain("' OR 1=1");expect(result.entries).toEqual([]);
  });
  it('preserves large scores and bounds pagination',async()=>{
    const rows=Array.from({length:21},(_,i)=>({publicId:`USR-${i}`,personId:`u${i}`,rank:BigInt(i+1),score:900719925474099300n,level:0,memberCount:0}));
    const db={$queryRaw:vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([{rank:22n,gap:900719925474099300n}]),user:{findMany:async()=>[]}};
    const data=await eventRankings({type:'wealth',period:'week',offset:0,q:'',viewerId:'viewer',origin:'https://portal.example'},db);
    expect(data.entries).toHaveLength(20);expect(data.entries.every(entry=>!('score' in entry)&&!('id' in entry))).toBe(true);expect(data.viewer).toEqual({rank:22,gap:'900719925474099300'});expect(data.nextOffset).toBe(20);
  });
});
it.each(['active','missing','expired','revoked','future','disabled'])('exposes only the current VIP tier for %s membership',async state=>{
  const membership={startsAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()+60000),revokedAt:null,tier:{active:true,level:4,assets:[]}};
  if(state==='expired')membership.expiresAt=new Date(0);
  if(state==='revoked')membership.revokedAt=new Date();
  if(state==='future')membership.startsAt=new Date(Date.now()+30000);
  if(state==='disabled')membership.tier.active=false;
  const db={$queryRaw:async()=>[{id:'u',publicId:'USR-0012',personId:'u',rank:1n,score:25n}],user:{findMany:vi.fn().mockResolvedValue([{id:'u',publicId:'USR-0012',vipLevel:99,vipMembership:state==='missing'?null:membership}])}};
  const data=await eventRankings({type:'wealth',period:'today',origin:'https://portal.example'},db);
  expect(data.entries[0].person.vip).toEqual(state==='active'?{level:4,artwork:null}:null);
  expect(db.user.findMany.mock.calls[0][0].select.uploadAssignments.where.source).toEqual({not:'VIP_TIER'});
});
it('derives agency level and tag from configured XP thresholds, never owner or legacy level',async()=>{
  const db={$queryRaw:async()=>[{id:'agency',publicId:'AGN-1',personId:'owner',rank:1n,score:100n,level:99}],user:{findMany:async()=>[]},
    activityLevelRule:{findUnique:async()=>({enabled:true,levels:[{level:0,threshold:'0'},{level:3,threshold:'100'}]})},
    activityLevelAward:{groupBy:async()=>[{subjectId:'agency',_sum:{xp:150n}}]},levelTagBackground:{findMany:vi.fn().mockResolvedValue([])}};
  const data=await eventRankings({type:'agency',period:'today',origin:'https://portal.example'},db);
  expect(data.entries[0]).toMatchObject({level:3,agencyLevel:3,agencyLevelBackgroundUrl:null});
  expect(db.levelTagBackground.findMany.mock.calls[0][0].where.OR).toEqual([{track:'AGENCY',level:3}]);
});

it('does not send agency owner badges, VIP or personal levels in an agency ranking',async()=>{
 const db={$queryRaw:async()=>[{id:'agency',publicId:'AGN-123',personId:'owner',name:'Agency',rank:2n,score:100n,gap:25n,memberCount:50}],user:{findMany:async()=>[{id:'owner',publicId:'USR-1',name:'Owner',profileImage:'/owner.png',uploadAssignments:[{asset:{publicId:'badge'}}]}]},activityLevelRule:{findUnique:async()=>null},activityLevelAward:{groupBy:async()=>[]},levelTagBackground:{findMany:async()=>[]}};
 const data=await eventRankings({type:'agency',period:'today',origin:'https://portal.example'},db);
 expect(data.entries[0]).toMatchObject({id:'AGN-123',gap:'25'});
 expect(data.entries[0]).not.toHaveProperty('memberCount');
 for(const key of ['ownedBadges','vip','badgeUrl','userLevel','charmLevel'])expect(data.entries[0].person).not.toHaveProperty(key);
});
