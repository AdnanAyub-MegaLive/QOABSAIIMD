import {it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {recordDeletionJournal,readDeletionJournal,assertNoRestoredDeletedAccounts} from './account-deletion-journal.js';
it('persists an idempotent recovery marker and blocks resurrection after a restore',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'deletion-journal-')),path=join(dir,'journal');
 try{
 const job={id:'request-1',userId:'user-1',scope:{identities:['user-1','USR-1'],anonymous:'DELETED-1'}};
 recordDeletionJournal(job,path);recordDeletionJournal(job,path);expect(readDeletionJournal(path)).toHaveLength(1);
 const db={accountDeletionRequest:{findUnique:vi.fn().mockResolvedValue({status:'COMPLETED'})},user:{findUnique:vi.fn().mockResolvedValue({publicId:'USR-1',deletedAt:null})}};
 await expect(assertNoRestoredDeletedAccounts(db,path)).rejects.toMatchObject({code:'RESTORED_DELETED_ACCOUNT'});
 db.user.findUnique.mockResolvedValue({publicId:'DELETED-1',deletedAt:new Date()});await expect(assertNoRestoredDeletedAccounts(db,path)).resolves.toBeUndefined();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
