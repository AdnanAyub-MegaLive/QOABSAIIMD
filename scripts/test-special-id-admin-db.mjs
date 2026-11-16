import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
dotenv.config({path:'.env.local',quiet:true});
const url=new URL(process.env.DATABASE_URL);
if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.includes('local')) throw new Error('Local test database required');
const {prisma}=await import('../src/lib/prisma.js');
const {manageHistoricalSpecialId}=await import('../src/lib/special-id-admin.js');
const rollback=new Error('ROLLBACK_TEST');
try {
 await prisma.$transaction(async tx=>{
  const admin=await tx.admin.findFirst();assert(admin);
  const code=`Q${randomUUID().replaceAll('-','').slice(0,6).toUpperCase()}`;
  const first=await tx.user.create({data:{publicId:`QA-${randomUUID()}`,name:'Rollback source'}});
  const second=await tx.user.create({data:{publicId:`QA-${randomUUID().toUpperCase()}`,name:'Rollback target'}});
  const definition=await tx.specialIdDefinition.create({data:{code,defaultDurationMinutes:60}});
  const old=await tx.specialIdAssignment.create({data:{userId:first.id,definitionId:definition.id,specialId:code,status:'REVOKED',revokedAt:new Date()}});
  const db={$transaction:fn=>fn(tx)};
  const base={assignmentId:old.id,reason:'Rollback integration test'};
  await manageHistoricalSpecialId(db,admin,{...base,action:'REASSIGN',publicId:second.publicId,durationMinutes:60});
  const assigned=await tx.specialIdAssignment.findFirst({where:{specialId:code,status:'ACTIVE'}});assert.equal(assigned.userId,second.id);
  await assert.rejects(()=>manageHistoricalSpecialId(db,admin,{...base,action:'REASSIGN',publicId:first.publicId,durationMinutes:60}),/currently owned/);
  await manageHistoricalSpecialId(db,admin,{...base,action:'DELETE'});
  assert.equal((await tx.specialIdAssignment.findUnique({where:{id:old.id}})).status,'REMOVED');
  assert.equal((await tx.specialIdAssignment.findUnique({where:{id:assigned.id}})).status,'ACTIVE');
  assert.equal((await tx.specialIdDefinition.findUnique({where:{id:definition.id}})).active,true);
  throw rollback;
 },{timeout:15000});
}catch(error){if(error!==rollback)throw error;console.log('Reassignment, occupied-ID protection and history removal passed; all test writes rolled back.');}
finally{await prisma.$disconnect();}
