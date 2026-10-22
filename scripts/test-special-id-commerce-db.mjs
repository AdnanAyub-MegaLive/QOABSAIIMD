// Integration test: all fixtures and financial writes roll back together.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
dotenv.config({path:'.env.local',quiet:true});
const {prisma}=await import('../src/lib/prisma.js');
const {purchaseSpecialId}=await import('../src/lib/special-id-commerce.js');
const rollback=new Error('QA_ROLLBACK');
let report;
try {
 await prisma.$transaction(async tx=>{
  const code=`QA${randomUUID().replaceAll('-','').slice(0,12)}`;
  const user=await tx.user.create({data:{publicId:`QA-${randomUUID()}`,name:'Special ID rollback test',coinBalance:100n}});
  const definition=await tx.specialIdDefinition.create({data:{code,coinPrice:20n,storeVisible:true,defaultDurationMinutes:10080}});
  const db={$transaction:async (fn,options)=>{assert.equal(options.isolationLevel,'Serializable');return fn(tx);}};
  const key=randomUUID();
  const result=await purchaseSpecialId(db,user.id,definition.id,key);
  assert.equal(result.coinBalance,'80');assert.equal(result.specialId,code);
  assert(new Date(result.expiresAt)>new Date());
  assert.deepEqual(await purchaseSpecialId(db,user.id,definition.id,key),result);
  assert.equal((await tx.user.findUniqueOrThrow({where:{id:user.id}})).coinBalance,80n);
  assert.equal(await tx.walletTransaction.count({where:{userId:user.id,type:'SPECIAL_ID_PURCHASE'}}),1);
  assert.equal(await tx.specialIdPurchase.count({where:{userId:user.id}}),1);
  const assignment=await tx.specialIdAssignment.findFirst({where:{userId:user.id,status:'ACTIVE',revokedAt:null,expiresAt:{gt:new Date()}}});
  assert.equal(assignment.specialId,code);
  report={purchasePassed:true,replayPassed:true,ledgerDebits:1,activeAssignment:true,coinBalance:result.coinBalance};
  throw rollback;
 },{isolationLevel:'Serializable',timeout:15000});
}catch(error){if(error!==rollback)throw error;console.log(JSON.stringify({...report,allWritesRolledBack:true}));}
finally{await prisma.$disconnect();}
