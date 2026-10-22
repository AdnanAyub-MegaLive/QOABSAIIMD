// Creates an EMPTY uniquely named database. Never clones or deletes source data.
import dotenv from 'dotenv';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {databaseDeletionPlan,executeDatabaseDeletion} from '../src/lib/database-management.js';
dotenv.config({path:'.env.local',quiet:true});
const original=process.env.ISOLATED_DATABASE_ADMIN_URL||process.env.DATABASE_URL;
const name='codex_delete_test_'+randomUUID().replaceAll('-','');
assert(/^codex_delete_test_[a-f0-9]{32}$/.test(name));
const target=new URL(original);assert(target.pathname!==`/${name}`);target.pathname='/'+name;
const control=new pg.Client({connectionString:original});let created=false,db;
try{
 await control.connect();
 await control.query(`CREATE DATABASE "${name}"`);created=true;
 console.log('Created isolated empty test database.');
 const push=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','push','--skip-generate'],{env:{...process.env,DATABASE_URL:target.href},encoding:'utf8'});
 if(push.status!==0){
   // Prisma 7 has removed --skip-generate on some releases.
   const retry=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','push'],{env:{...process.env,DATABASE_URL:target.href},encoding:'utf8'});
   if(retry.status!==0)throw Error('Isolated schema creation failed.');
 }
 db=new PrismaClient({adapter:new PrismaPg({connectionString:target.href})});
 const actual=await db.$queryRawUnsafe('SELECT current_database() AS name');assert.equal(actual[0].name,name);
 process.env.ADMIN_EMAIL='isolated-owner@example.test';
 const admin=await db.admin.create({data:{name:'QA',email:process.env.ADMIN_EMAIL,passwordHash:'not-a-login',role:'SUPER_ADMIN'}});
 const user=await db.user.create({data:{publicId:'USR-QA-DELETE',name:'QA delete'}});
 const keep=await db.user.create({data:{publicId:'USR-QA-KEEP',name:'QA keep',coinBalance:123n}});
 await db.device.create({data:{userId:user.id,macAddress:'QA-delete-device'}});
 const asset=await db.uploadAsset.create({data:{publicId:'AST-QA-SHARED',name:'Shared QA frame',category:'FRAMES',fileName:'qa.png',mimeType:'image/png',fileSize:1,fileData:Buffer.from([0])}});
 await db.uploadAssetAssignment.create({data:{assetId:asset.id,userId:user.id}});
 await db.uploadAssetAssignment.create({data:{assetId:asset.id,userId:keep.id}});
 await db.walletTransaction.create({data:{publicId:'WAL-QA-DELETE',userId:user.id,type:'ADMIN_ADJUSTMENT',direction:'CREDIT',title:'QA',coins:1n}});
 const removeOutbox=await db.realtimeOutbox.create({data:{channel:'user:'+user.publicId,event:'qa',payload:{nested:[{senderId:user.id}]}}});
 const keepOutbox=await db.realtimeOutbox.create({data:{channel:'user:'+keep.publicId,event:'qa',payload:{text:user.publicId+'-suffix',coins:2030140}}});
 await db.auditLog.create({data:{action:'QA',category:'USER_MANAGEMENT',entityType:'User',entityId:user.id,description:'Test '+user.publicId}});
 const scope={mode:'ROW',table:'User',id:user.publicId};
 const preview=await db.$transaction(tx=>databaseDeletionPlan(tx,scope),{timeout:60000});
 assert(preview.counts.some(c=>c.table==='RealtimeOutbox'&&c.count===1));
 assert(preview.counts.some(c=>c.table==='AuditLog'));
 assert.equal(await db.user.count(),2); // Preview is read-only.
 const payload={adminId:admin.id,sessionVersion:admin.sessionVersion,scope,fingerprint:preview.fingerprint};
 await db.user.update({where:{id:user.id},data:{bio:'changed after preview'}});
 await assert.rejects(executeDatabaseDeletion(db,payload),e=>e.code==='PREVIEW_STALE');
 assert.equal(await db.user.count(),2);
 const fresh=await db.$transaction(tx=>databaseDeletionPlan(tx,scope),{timeout:60000});
 const result=await executeDatabaseDeletion(db,{...payload,fingerprint:fresh.fingerprint});
 assert(result.deleted>=3);
 assert.equal(await db.user.findUnique({where:{id:user.id}}),null);
 assert.equal(await db.realtimeOutbox.findUnique({where:{id:removeOutbox.id}}),null);
 assert(await db.realtimeOutbox.findUnique({where:{id:keepOutbox.id}}));
 assert.equal((await db.user.findUnique({where:{id:keep.id}})).coinBalance,123n);
 assert.equal(await db.auditLog.count(),0);
 assert.equal(await db.device.count(),0);
 assert.equal(await db.walletTransaction.count(),0);
 assert.equal(await db.uploadAssetAssignment.count(),1);
 assert(await db.uploadAsset.findUnique({where:{id:asset.id}}));
 const reset=await db.$transaction(tx=>databaseDeletionPlan(tx,{mode:'RESET'}),{timeout:60000});
 await executeDatabaseDeletion(db,{...payload,scope:{mode:'RESET'},fingerprint:reset.fingerprint});
 assert.equal(await db.user.count(),0);assert.equal(await db.admin.count(),1);
 console.log('PASS: full-schema preview, stale rollback, JSON/text cleanup, unrelated balance preservation, reset and protected admin.');
}finally{
 await db?.$disconnect();
 if(created){
   // Only the exact random database successfully created by this process.
   assert(/^codex_delete_test_[a-f0-9]{32}$/.test(name));
   await control.query(`DROP DATABASE "${name}"`);
   console.log('Removed disposable test database; source database untouched.');
 }
 await control.end();
}
