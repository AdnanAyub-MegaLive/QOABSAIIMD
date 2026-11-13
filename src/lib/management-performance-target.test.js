import {expect,it,vi} from 'vitest';
vi.mock('./prisma.js',()=>({prisma:{}}));
vi.mock('./reporting-cycles.js',()=>({reportCycle:vi.fn(async()=>({key:'2026-11',month:'2026-11',timezone:'UTC',start:new Date(0),end:new Date(1)})),publicCycle:vi.fn(()=>({}))}));
vi.mock('./agency-work.js',()=>({agencyWorkReports:vi.fn(async()=>[]),hierarchyWork:vi.fn(people=>people.map(p=>({publicId:p.publicId}))),usdValue:vi.fn(()=>null)}));
vi.mock('./management-target-report.js',()=>({managementTargets:vi.fn(async()=>new Map([['J',{goal:'10'}],['A',{goal:'5'}]]))}));
import {managementPerformance} from './management-business.js';
const people=[
 {id:'j',publicId:'J',appRoles:['JUNIOR_ADMIN'],country:'PK',status:'ACTIVE'},
 {id:'a',publicId:'A',appRoles:['ADMIN'],country:'pakistan',status:'ACTIVE',supervisorUserId:'j'},
];
it('returns the caller target at the top level and keeps hierarchy targets',async()=>{
 const db={user:{findUnique:async({where})=>people.find(p=>p.id===where.id),findMany:async({where})=>people.filter(p=>where.supervisorUserId.in.includes(p.supervisorUserId))},agency:{findMany:async()=>[]},giftSettlement:{groupBy:async()=>[]}};
 const result=await managementPerformance('j','2026-11',null,db);
 expect(result.target).toEqual({goal:'10'});
 expect(result.hierarchy).toEqual([{publicId:'J',target:{goal:'10'}},{publicId:'A',target:{goal:'5'}}]);
});
