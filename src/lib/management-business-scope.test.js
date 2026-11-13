import {expect,it,vi} from 'vitest';
vi.mock('./prisma.js',()=>({prisma:{}}));
import {businessScope,managementPerformance,assignManagementAgency} from './management-business.js';
const people=[
 {id:'j',publicId:'J',appRoles:['JUNIOR_ADMIN'],country:'PK',status:'ACTIVE'},
 {id:'a',publicId:'A',appRoles:['ADMIN'],country:'PK',status:'ACTIVE',supervisorUserId:'j'},
 {id:'b',publicId:'B',appRoles:['BD'],country:'PK',status:'ACTIVE',supervisorUserId:'a'},
 {id:'other',publicId:'OTHER',appRoles:['BD'],country:'PK',status:'ACTIVE'},
];
function database(){return {reportingCyclePolicy:{findMany:async()=>[]},user:{findUnique:async({where})=>people.find(p=>p.id===where.id),findMany:async({where})=>people.filter(p=>where.supervisorUserId.in.includes(p.supervisorUserId))},agency:{findMany:vi.fn(async()=>[])}};}
it('allows downward visibility but not upward or unrelated teams',async()=>{
 expect((await businessScope('j',database())).ids).toEqual(['j','a','b']);
 expect((await businessScope('a',database())).ids).toEqual(['a','b']);
 expect((await businessScope('b',database())).ids).toEqual(['b']);
});
it('rejects agency detail requests outside the authenticated subtree',async()=>{
 const db=database();
 await expect(managementPerformance('b','2026-10','AGN-UPWARD',db)).rejects.toThrow('outside your team');
 expect(db.agency.findMany.mock.lastCall[0].where).toMatchObject({country:'PK',bdUserId:{in:['b']}});
});
it('defaults the assigned supervisor to the caller when bdCode is missing',async()=>{
 const db=database();
 db.user.findUnique=async({where})=>people.find(p=>where.id?p.id===where.id:p.publicId===where.publicId);
 db.agency.findUnique=async()=>({id:'ag',publicId:'AGN-1',country:'PK',status:'ACTIVE',bdUserId:null,owner:{country:'Pakistan'}});
 db.agency.update=vi.fn(async()=>({}));db.auditLog={create:vi.fn()};db.$transaction=fn=>fn(db);
 expect(await assignManagementAgency('b','AGN-1',db)).toEqual({agencyId:'AGN-1',supervisorId:'B'});
 expect(db.agency.update).toHaveBeenCalledWith({where:{id:'ag'},data:{bdUserId:'b'}});
 expect(await assignManagementAgency('b','AGN-1',db,'  ')).toEqual({agencyId:'AGN-1',supervisorId:'B'});
});
