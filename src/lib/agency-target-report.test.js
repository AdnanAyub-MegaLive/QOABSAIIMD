import {it,expect,vi} from 'vitest';
vi.mock('./reporting-cycles.js',()=>({moduleCycle:vi.fn()}));
vi.mock('./host-salary.js',async importOriginal=>({...await importOriginal(),cycleHostTotals:vi.fn()}));
import {moduleCycle} from './reporting-cycles.js';
import {cycleHostTotals} from './host-salary.js';
import {agencyWorkReports} from './agency-work.js';
it('keeps host-cycle levels separate and attributes only the agency share, without awarding rewards',async()=>{
 const start=new Date('2026-10-01T00:00:00Z'),mid=new Date('2026-10-16T00:00:00Z'),end=new Date('2026-11-01T00:00:00Z');
 moduleCycle.mockImplementation(async(db,module,at)=>+at===+start?{start,end:mid}:{start:mid,end});
 cycleHostTotals.mockResolvedValueOnce(new Map([['u',{total:900000n,agencies:new Map([['a',450000n],['b',450000n]]),incomplete:false}]]))
 .mockResolvedValueOnce(new Map([['u',{total:450000n,agencies:new Map([['a',450000n]]),incomplete:false}]]));
 const db={hostSalarySchedule:{findFirst:vi.fn().mockResolvedValue({effectiveFrom:start,tiers:[{level:1,target:450000,percent:1,reward:0,vip:0,days:0},{level:2,target:900000,percent:1,reward:100,vip:1,days:3}]})},hostSalaryAward:{findMany:vi.fn().mockResolvedValue([])}};
 const [report]=await agencyWorkReports(db,[{id:'a'}],{start,end});
 expect(report.work.totalDiamonds).toBe('900000');
 expect(report.work.salaryDiamonds).toBe('9000');
 expect(report.work.hosts[0].salaryCycles.map(c=>c.level)).toEqual([2,1]);
 expect(report.work.hosts[0].salaryCycles[0]).toMatchObject({earned:'900000',agencyDiamonds:'450000',agencyShareDiamonds:'4500',current:{reward:100}});
 expect(JSON.parse(JSON.stringify(report)).work.hosts[0].salaryCycles).toHaveLength(2);
});
