import { describe,it,expect,vi } from 'vitest';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('../user-perks.js',()=>({resolveUserPerks:async()=>new Map()}));
vi.mock('../avatar-history.js',()=>({avatarDisplayUrl:value=>value}));
import { eventRankings } from './ranking-data.js';
describe('ranking data',()=>{
  it.each(['wealth','charm','agency','cp'])('builds parameterized %s ranking with refund and privacy filters',async type=>{
    const db={$queryRaw:vi.fn().mockResolvedValue([]),user:{findMany:vi.fn().mockResolvedValue([])}};
    const result=await eventRankings({type,period:'today',offset:0,q:"' OR 1=1",viewerId:'viewer',origin:'https://portal.example'},db);
    const query=db.$queryRaw.mock.calls[0][0];
    expect(query.sql).toContain('"reversedAt" IS NULL');expect(query.sql).toContain('"UserBlock"');expect(query.sql).not.toContain("' OR 1=1");expect(query.values).toContain("' OR 1=1");expect(result.entries).toEqual([]);
  });
  it('preserves large scores and bounds pagination',async()=>{
    const rows=Array.from({length:21},(_,i)=>({publicId:`USR-${i}`,personId:`u${i}`,rank:BigInt(i+1),score:900719925474099300n,level:0,memberCount:0}));
    const db={$queryRaw:async()=>rows,user:{findMany:async()=>[]}};
    const data=await eventRankings({type:'wealth',period:'week',offset:0,q:'',viewerId:'viewer',origin:'https://portal.example'},db);
    expect(data.entries).toHaveLength(20);expect(data.entries[0].score).toBe('900719925474099300');expect(data.nextOffset).toBe(20);
  });
});
