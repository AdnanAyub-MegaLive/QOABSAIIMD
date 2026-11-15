import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
vi.mock('./room-banner-media.js',()=>({bannerObject:vi.fn()}));
vi.mock('./voice-storage.js',()=>({voiceObject:vi.fn()}));
vi.mock('./chat-media.js',()=>({privateChatObject:vi.fn()}));
vi.mock('./account-deletion-cdn.js',async original=>({...await original(),deletePublicDeletionObject:vi.fn()}));
import {deletePublicDeletionObject} from './account-deletion-cdn.js';
import { requestAccountDeletion, purgeAccountData, runAccountDeletion } from './account-deletion.js';
let engine,db;
beforeAll(async()=>{
 const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema','prisma/schema.prisma','--script'],{encoding:'utf8'});
 engine=new PGlite(); await engine.exec(sql);
 const migration=(await import('node:fs')).readFileSync('prisma/migrations/20261115010000_account_deletion/migration.sql','utf8');await engine.exec(migration.slice(migration.indexOf('CREATE FUNCTION')));db=new PrismaClient({adapter:new PrismaPGlite(engine)});
},30000);
afterAll(async()=>{await db?.$disconnect();await engine?.close();});
it('purges private records and revokes identity without changing another wallet or shared ledger amounts',async()=>{
 const target=await db.user.create({data:{publicId:'DELETE-TEST',name:'Private Name',email:'private@example.invalid',googleSubject:'private-subject',coinBalance:900n}});
 const other=await db.user.create({data:{publicId:'KEEP-TEST',name:'Other',coinBalance:1234n}});
 const post=await db.post.create({data:{publicId:'POST-DELETE',authorId:target.id,description:'private content',imageData:Buffer.from('private')}});
 await db.postLike.create({data:{postId:post.id,userId:other.id}});
 const gift=await db.giftTransaction.create({data:{senderId:target.id,recipientUserId:other.id,giftName:'Rose',coinValue:100n}});
 await db.giftRecoverySnapshot.create({data:{giftId:gift.id,data:{sender:{publicId:target.publicId,name:'Private Name'},recipient:{publicId:other.publicId,name:'Other'},amount:100}}});
 const c=await db.conversation.create({data:{publicId:'CHAT-TEST',kind:'DIRECT',createdById:target.id,participants:{create:[{userId:target.id},{userId:other.id}]}}});
 await db.message.create({data:{publicId:'MSG-DELETE',conversationId:c.id,senderId:target.id,body:'secret'}});
 await db.message.create({data:{publicId:'MSG-KEEP',conversationId:c.id,senderId:other.id,body:'other message'}});
 const application=await db.agencyApplication.create({data:{publicId:'APP-KEEP',userId:other.id,bdUserId:target.id,agencyName:'Other agency',whatsapp:'test',bdCode:'test'}});
 const job=await requestAccountDeletion(db,target.id,{source:'AUTHENTICATED_USER'});
 expect((await requestAccountDeletion(db,target.id,{source:'AUTHENTICATED_USER'})).id).toBe(job.id);
 await purgeAccountData(db,job.id);
 expect((await db.agencyApplication.findUnique({where:{id:application.id}})).bdUserId).toBeNull();
 expect(await db.post.count({where:{authorId:target.id}})).toBe(0);
 expect(await db.message.count({where:{senderId:target.id}})).toBe(0);
 expect(await db.message.count({where:{senderId:other.id}})).toBe(1);
 expect((await db.user.findUnique({where:{id:other.id}})).coinBalance).toBe(1234n);
 expect((await db.giftTransaction.findFirst()).coinValue).toBe(100n);
 const cleaned=await db.user.findUnique({where:{id:target.id}});
 expect(cleaned.email).toBeNull();expect(cleaned.googleSubject).toBeNull();expect(cleaned.name).toBe('Deleted User');expect(cleaned.publicId).toMatch(/^DELETED-/);
 await runAccountDeletion(db,job.id);
 expect((await db.accountDeletionRequest.findUnique({where:{id:job.id}})).status).toBe('REVIEW_REQUIRED');
 const snapshot=(await db.giftRecoverySnapshot.findUnique({where:{giftId:gift.id}})).data;
 expect(snapshot.sender.name).toBeNull();expect(snapshot.sender.publicId).toBe(cleaned.publicId);
 expect(snapshot.recipient).toEqual({publicId:other.publicId,name:'Other'});expect(snapshot.amount).toBe(100);
},30000);
it('rejects unverified support requests before changing an account',async()=>{
 const u=await db.user.create({data:{publicId:'VERIFY-TEST',name:'Untouched'}});
 await expect(requestAccountDeletion(db,u.id,{source:'VERIFIED_SUPPORT'})).rejects.toMatchObject({code:'UNVERIFIED_REQUEST'});
 expect((await db.user.findUnique({where:{id:u.id}})).deletedAt).toBeNull();
});

it('fails closed when the database acquires an unreviewed ownership table',async()=>{
 const u=await db.user.create({data:{publicId:'UNKNOWN-TEST',name:'Keep until reviewed'}});
 const job=await requestAccountDeletion(db,u.id,{source:'AUTHENTICATED_USER'});
 await engine.exec('CREATE TABLE "UnreviewedPrivateData" ("userId" text REFERENCES "User"(id))');
 try {
  await expect(purgeAccountData(db,job.id)).rejects.toThrow('UNREVIEWED_USER_RELATION');
  expect((await db.user.findUnique({where:{id:u.id}})).name).toBe('Keep until reviewed');
 } finally {await engine.exec('DROP TABLE "UnreviewedPrivateData"');}
});

it('does not silently complete deletion while a public media copy needs removal',async()=>{
 const u=await db.user.create({data:{publicId:'MEDIA-TEST',name:'Media owner'}});
 await db.uploadAsset.create({data:{publicId:'MEDIA-AVATAR',name:'Avatar',category:'AVATARS',fileName:'avatar.webp',mimeType:'image/webp',fileSize:1,fileData:Buffer.from('x'),isGlobal:false,storeVisible:false,cdnUrl:`https://media.megachat.live/portal-media/MEDIA-AVATAR/${'a'.repeat(64)}.webp`,assignments:{create:{userId:u.id}}}});
 const job=await requestAccountDeletion(db,u.id,{source:'AUTHENTICATED_USER'});
 deletePublicDeletionObject.mockRejectedValueOnce(Object.assign(Error('Cache purge failed'),{code:'CDN_PURGE_FAILED'}));
 await expect(runAccountDeletion(db,job.id)).rejects.toMatchObject({code:'CDN_PURGE_FAILED'});
 expect((await db.accountDeletionRequest.findUnique({where:{id:job.id}})).status).toBe('MEDIA_PENDING');
 expect(await db.accountDeletionObject.count({where:{requestId:job.id,completedAt:null}})).toBe(1);
 deletePublicDeletionObject.mockResolvedValueOnce();await runAccountDeletion(db,job.id);
 expect(await db.accountDeletionObject.count({where:{requestId:job.id,completedAt:null}})).toBe(0);
});

it('requires verified completion and records recovery proof before completing',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {completeAccountDeletion}=await import('./account-deletion.js');
 const dir=mkdtempSync(join(tmpdir(),'deletion-completion-'));
 try {
 const u=await db.user.create({data:{publicId:'COMPLETE-TEST',name:'Erase'}});
 const job=await requestAccountDeletion(db,u.id,{source:'AUTHENTICATED_USER'});
 await expect(completeAccountDeletion(db,job.id,{verifiedBy:'support'},dir)).rejects.toMatchObject({code:'REVIEW_REQUIRED'});
 await runAccountDeletion(db,job.id);
 const result=await completeAccountDeletion(db,job.id,{verifiedBy:'support',externalCopiesReviewed:true,backupPolicyVerified:true},dir);
 expect(result.status).toBe('COMPLETED');expect(result.scope).toBeNull();
 const {assertNoRestoredDeletedAccounts}=await import('./account-deletion-journal.js');
 await expect(assertNoRestoredDeletedAccounts(db,dir)).resolves.toBeUndefined();
 await db.accountDeletionRequest.update({where:{id:job.id},data:{status:'MEDIA_PENDING'}});
 await expect(assertNoRestoredDeletedAccounts(db,dir)).rejects.toMatchObject({code:'RESTORED_DELETED_ACCOUNT'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('removes CP history before the relationship and removes private room music',async()=>{
 const u=await db.user.create({data:{publicId:'CP-DELETE',name:'Erase'}}),v=await db.user.create({data:{publicId:'CP-KEEP',name:'Keep'}});
 const relation=await db.profileRelationship.create({data:{publicId:'CP-RELATION-TEST',leftUserId:u.id,rightUserId:v.id,type:'CP',status:'ACTIVE'}});
 const gift=await db.giftTransaction.create({data:{senderId:u.id,recipientUserId:v.id,giftName:'CP',coinValue:1n}});
 await db.cpGiftExperience.create({data:{giftId:gift.id,relationshipId:relation.id,amount:1n}});
 const room=await db.audioRoom.create({data:{roomId:'DELETE-ROOM',ownerId:u.id,title:'Private'}});
 await db.uploadAsset.create({data:{publicId:'PRIVATE-MUSIC',name:'Private',fileName:'private.mp3',mimeType:'audio/mpeg',fileSize:1,fileData:Buffer.from('x'),category:'MUSIC_TRACKS',audioRoomId:room.id,isGlobal:false}});
 const job=await requestAccountDeletion(db,u.id,{source:'AUTHENTICATED_USER'});await runAccountDeletion(db,job.id);
 expect(await db.cpGiftExperience.count({where:{relationshipId:relation.id}})).toBe(0);
 expect(await db.profileRelationship.findUnique({where:{id:relation.id}})).toBeNull();
 expect(await db.uploadAsset.count({where:{audioRoomId:room.id}})).toBe(0);
 expect((await db.user.findUnique({where:{id:v.id}})).deletedAt).toBeNull();
});

it('prevents a delayed wallet credit or profile edit from reviving erased accounts',async()=>{
 const u=await db.user.create({data:{publicId:'REVIVE-TEST',name:'Erase'}});
 const job=await requestAccountDeletion(db,u.id,{source:'AUTHENTICATED_USER'});await runAccountDeletion(db,job.id);
 await expect(db.user.update({where:{id:u.id},data:{coinBalance:{increment:5n}}})).rejects.toThrow();
 await expect(db.user.update({where:{id:u.id},data:{name:'Restored'}})).rejects.toThrow();
});
