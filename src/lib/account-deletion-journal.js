import {existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const fail=code=>Object.assign(new Error('Deletion recovery journal needs administrator review.'),{code});
export function deletionJournalPath(env=process.env){
 if(!env.ACCOUNT_DELETION_JOURNAL_DIR)throw fail('DELETION_JOURNAL_NOT_CONFIGURED');return env.ACCOUNT_DELETION_JOURNAL_DIR;
}
export function readDeletionJournal(path=deletionJournalPath()){
 if(!existsSync(path))return [];
 if(!statSync(path).isDirectory()||(statSync(path).mode&0o077))throw fail('DELETION_JOURNAL_PERMISSIONS');
 return readdirSync(path).filter(name=>name.endsWith('.json')).map(name=>{
  if(!/^[a-zA-Z0-9_-]+\.json$/.test(name))throw fail('DELETION_JOURNAL_INVALID');
  const file=join(path,name);if(statSync(file).mode&0o077)throw fail('DELETION_JOURNAL_PERMISSIONS');
  try{const row=JSON.parse(readFileSync(file,'utf8'));if(!row.userId||!row.requestId||!row.anonymous||!Array.isArray(row.identities))throw Error();return row;}
  catch{throw fail('DELETION_JOURNAL_INVALID');}
 });
}
export function recordDeletionJournal(job,path=deletionJournalPath()){
 if(!/^[a-zA-Z0-9_-]+$/.test(job.id)||!job.scope?.anonymous||!job.scope?.identities)throw fail('DELETION_JOURNAL_SCOPE_MISSING');
 mkdirSync(path,{recursive:true,mode:0o700});
 if(statSync(path).mode&0o077)throw fail('DELETION_JOURNAL_PERMISSIONS');
 const target=join(path,job.id+'.json');if(existsSync(target))return;
 const temp=join(path,randomUUID()+'.tmp');
 try{
  writeFileSync(temp,JSON.stringify({requestId:job.id,userId:job.userId,identities:job.scope.identities,anonymous:job.scope.anonymous,erasedAt:new Date().toISOString()}),{mode:0o600,flag:'wx',flush:true});
  renameSync(temp,target);
 }finally{if(existsSync(temp))unlinkSync(temp);}
}
// Check before accepting traffic after a restore. Recovery markers live outside
// database dumps so restoring an old database cannot silently restore an account.
export async function assertNoRestoredDeletedAccounts(db,path=deletionJournalPath()){
 for(const row of readDeletionJournal(path)){
  const user=await db.user.findUnique({where:{id:row.userId},select:{publicId:true,deletedAt:true}});
  const job=await db.accountDeletionRequest.findUnique({where:{id:row.requestId},select:{status:true}});
  if(user&&(!user.deletedAt||user.publicId!==row.anonymous||job?.status!=='COMPLETED'))throw fail('RESTORED_DELETED_ACCOUNT');
 }
}
