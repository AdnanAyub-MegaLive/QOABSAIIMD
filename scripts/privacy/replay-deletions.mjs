// Run with portal/workers stopped after restoring a database, before accepting traffic.
import {existsSync} from 'node:fs';
if(process.argv[2]!=='--offline-confirmed')throw Error('Stop all portal workers, then pass --offline-confirmed.');
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
process.env.ACCOUNT_DELETION_ENABLED='true';
const {prisma}=await import('../../src/lib/prisma.js');
const {readDeletionJournal,assertNoRestoredDeletedAccounts}=await import('../../src/lib/account-deletion-journal.js');
const {purgeAccountData,runAccountDeletion,completeAccountDeletion}=await import('../../src/lib/account-deletion.js');
try {
 for(const row of readDeletionJournal()) {
  const user=await prisma.user.findUnique({where:{id:row.userId}});if(!user)continue;
  const existing=await prisma.accountDeletionRequest.findUnique({where:{id:row.requestId}});
  if(existing?.status==='COMPLETED'&&user.publicId===row.anonymous)continue;
  await prisma.$transaction(async tx=>{
   await tx.user.update({where:{id:row.userId},data:{status:'BANNED',deletedAt:new Date(),forcedLogoutAt:new Date(),sessionVersion:{increment:1}}});
   await tx.accountDeletionRequest.upsert({where:{id:row.requestId},create:{id:row.requestId,userId:row.userId,source:'RESTORE_REPLAY',createdAt:new Date(0),scope:{restoreAnonymous:row.anonymous}},update:{status:'RETRY',createdAt:new Date(0),scope:{restoreAnonymous:row.anonymous},attempts:0}});
  });
  await purgeAccountData(prisma,row.requestId);
  // A partially cleaned backup may already contain the anonymous User row but
  // still contain original identities in snapshots. Preserve all journal IDs.
  await prisma.accountDeletionRequest.update({where:{id:row.requestId},data:{scope:{identities:row.identities,anonymous:row.anonymous}}});
  // Each pass is bounded; any unsettled restored ledger requires manual reconciliation.
  for(let pass=0;pass<1000;pass++) {
   await runAccountDeletion(prisma,row.requestId);
   const job=await prisma.accountDeletionRequest.findUnique({where:{id:row.requestId}});
   if(job.status==='REVIEW_REQUIRED') {await completeAccountDeletion(prisma,row.requestId,{verifiedBy:'RESTORE_REPLAY',externalCopiesReviewed:true,backupPolicyVerified:true});break;}
   await new Promise(resolve=>setTimeout(resolve,10000));
  }
 }
 await assertNoRestoredDeletedAccounts(prisma);
 console.log('Recovery deletion replay verified.');
}finally{await prisma.$disconnect();}
