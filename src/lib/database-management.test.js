import {afterEach,expect,it,vi} from 'vitest';
import {isDatabaseOwner} from './database-management-access.js';
import {databaseDeletionPlan,sealDatabasePreview,openDatabasePreview,executeDatabaseDeletion} from './database-management.js';
afterEach(()=>vi.unstubAllEnvs());
it('fails closed unless the active super admin matches the configured owner',()=>{
 const admin={email:'admin@megachat.live',active:true,role:'SUPER_ADMIN'};
 expect(isDatabaseOwner(admin,'admin@megachat.live')).toBe(true);
 expect(isDatabaseOwner(admin,'')).toBe(false);
 expect(isDatabaseOwner({...admin,email:'other@example.com'},'admin@megachat.live')).toBe(false);
 expect(isDatabaseOwner({...admin,role:'ADMIN'},'admin@megachat.live')).toBe(false);
 expect(isDatabaseOwner({...admin,active:false},'admin@megachat.live')).toBe(false);
});
it('binds short-lived previews to the admin and rejects tampering',()=>{
 vi.stubEnv('AUTH_SECRET','test-database-management-secret');
 const token=sealDatabasePreview({adminId:'one',expiresAt:100});
 expect(openDatabasePreview(token,'one',99).adminId).toBe('one');
 expect(()=>openDatabasePreview(token,'two',99)).toThrow();
 expect(()=>openDatabasePreview(token,'one',101)).toThrow();
 expect(()=>openDatabasePreview(token+'x','one',99)).toThrow();
});
function fixture(){
 const tx={$queryRawUnsafe:vi.fn(async sql=>{
   if(sql.includes('FROM pg_tables'))return [{name:'Admin'},{name:'_prisma_migrations'},{name:'User'},{name:'Device'}];
   if(sql.includes('FROM pg_constraint'))return [{child:'Device',parent:'User',childColumns:['userId'],parentColumns:['id']}];
   if(sql.includes('information_schema'))return [{name:'id'},{name:'publicId'}];
   if(sql.includes('JOIN "public"."User"'))return [{locator:'(1,2)'}];
   if(sql.includes('FROM "public"."User"'))return [{locator:'(0,1)'}];
   return [];
 })};return tx;
}
it('previews dependency closure without delete or update queries',async()=>{
 const tx=fixture(),plan=await databaseDeletionPlan(tx,{mode:'ROW',table:'User',id:'USR-1'});
 expect(plan.counts).toEqual([{table:'Device',count:1},{table:'User',count:1}]);
 expect(tx.$queryRawUnsafe.mock.calls.every(([sql])=>!sql.includes('DELETE'))).toBe(true);
 expect(tx.$queryRawUnsafe.mock.calls.find(([sql])=>sql.includes('WHERE "id"'))[1]).toBe('USR-1');
});
it('rejects protected tables and injected identifiers',async()=>{
 for(const table of ['Admin','_prisma_migrations','User; DROP TABLE "Admin"'])await expect(databaseDeletionPlan(fixture(),{mode:'TABLE',table})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
});
it('refuses stale previews before any deletion',async()=>{
 vi.stubEnv('ADMIN_EMAIL','admin@megachat.live');
 const tx=fixture();tx.$executeRawUnsafe=vi.fn();tx.admin={findUnique:async()=>({active:true,email:'admin@megachat.live',role:'SUPER_ADMIN',sessionVersion:1})};
 await expect(executeDatabaseDeletion({$transaction:fn=>fn(tx)},{adminId:'one',sessionVersion:1,scope:{mode:'ROW',table:'User',id:'USR-1'},fingerprint:'stale'})).rejects.toMatchObject({code:'PREVIEW_STALE'});
 expect(tx.$queryRawUnsafe.mock.calls.some(([sql])=>sql.includes('DELETE'))).toBe(false);
});
