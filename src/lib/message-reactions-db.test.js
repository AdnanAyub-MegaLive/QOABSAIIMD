import {beforeAll,afterAll,test,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {PrismaPGlite} from 'pglite-prisma-adapter';
import {PrismaClient} from '@prisma/client';
import {execFileSync} from 'node:child_process';
import {changeMessageReaction} from './message-reactions.js';
import {summarizeReactions,validateReactionEmoji} from './message-reaction-summary.js';
let engine,db,a,b,c,conversation,message;
const present=async(record,viewer)=>({id:record.publicId,reactions:summarizeReactions(record.reactions,viewer)});
beforeAll(async()=>{
 const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema','prisma/schema.prisma','--script'],{encoding:'utf8'});
 engine=new PGlite();await engine.exec(sql);db=new PrismaClient({adapter:new PrismaPGlite(engine)});
 [a,b,c]=await Promise.all(['A','B','C'].map(publicId=>db.user.create({data:{publicId,name:publicId}})));
 conversation=await db.conversation.create({data:{publicId:'CONV',kind:'DIRECT',participants:{create:[{userId:a.id},{userId:b.id}]}}});
 message=await db.message.create({data:{publicId:'MSG',conversationId:conversation.id,senderId:a.id,body:'hello'}});
},30000);
afterAll(async()=>{await db?.$disconnect();await engine?.close();});
const change=(userId,extra={})=>changeMessageReaction(db,{conversationId:'CONV',messageId:'MSG',userId,emoji:'❤️',...extra},present);
test('emoji validation allows complex emoji and rejects text/multiple emoji',()=>{
 for(const emoji of ['❤️','👍🏽','👨‍👩‍👧','🇵🇰','1️⃣'])expect(validateReactionEmoji(emoji)).toBe(emoji);
 for(const emoji of ['', 'hello','👍👍','a❤️'])expect(()=>validateReactionEmoji(emoji)).toThrow();
});
test('unique reactions, personal mine flag, durable fanout and remove only own emoji',async()=>{
 await change(a.id);await change(a.id);await change(b.id);
 expect(await db.messageReaction.count()).toBe(2);
 const result=await change(a.id,{emoji:'👍'});
 expect(result.message.reactions).toEqual(expect.arrayContaining([{emoji:'❤️',count:2,mine:true},{emoji:'👍',count:1,mine:true}]));
 const events=await db.realtimeOutbox.findMany({orderBy:{createdAt:'desc'},take:2});
 expect(events.map(e=>e.channel).sort()).toEqual(['user:A','user:B']);
 expect(events.find(e=>e.channel==='user:B').payload.message.reactions.find(r=>r.emoji==='👍').mine).toBe(false);
 await change(a.id,{remove:true});expect(await db.messageReaction.count()).toBe(2); // remove heart only
 await change(a.id,{remove:true,emoji:undefined});expect(await db.messageReaction.count()).toBe(1);
 await change(a.id,{remove:true,emoji:undefined});expect(await db.messageReaction.count()).toBe(1);
});
test('outsiders, wrong conversations, blocked users and deleted messages cannot react',async()=>{
 await expect(change(c.id)).rejects.toMatchObject({code:'CONVERSATION_NOT_FOUND'});
 await expect(change(a.id,{conversationId:'OTHER'})).rejects.toMatchObject({code:'CONVERSATION_NOT_FOUND'});
 await db.userBlock.create({data:{blockerId:b.id,blockedId:a.id}});
 await expect(change(a.id)).rejects.toThrow();
 await db.userBlock.deleteMany();
 await db.message.update({where:{id:message.id},data:{deletedAt:new Date()}});
 await expect(change(a.id)).rejects.toMatchObject({code:'MESSAGE_NOT_FOUND'});
 await db.message.delete({where:{id:message.id}});expect(await db.messageReaction.count()).toBe(0);
});
