import {describe,it,expect,vi} from 'vitest';
import {resolveRoomMentions} from './room-mentions.js';
import {plainRoomMessage} from './room-message-delivery.js';
import {serializeRoomChatMessages} from './audio-room-chat.js';
const users=[{publicId:'USR-A',name:'Ali'},{publicId:'USR-B',name:'Ali'}];
const db={user:{findMany:vi.fn(async()=>users)}};
const members=new Set(users.map(u=>u.publicId));
describe('structured room mentions',()=>{
 it('keeps same-name people distinct and uses UTF-16 offsets after trimming',async()=>{
  const result=await resolveRoomMentions(db,'  😀 @Ali @Ali  ',[{publicId:'USR-B',start:5,end:9},{publicId:'USR-A',start:10,end:14}],members);
  expect(result).toEqual([{publicId:'USR-B',name:'Ali',start:3,end:7},{publicId:'USR-A',name:'Ali',start:8,end:12}]);
 });
 it('never guesses IDs from unstructured names',async()=>expect(await resolveRoomMentions(db,'hi @Ali',undefined,members)).toEqual([]));
 it.each([
 [{publicId:'USR-C',start:0,end:4}],
 [{publicId:'USR-A',start:0,end:3}],
 [{publicId:'USR-A',start:0,end:4},{publicId:'USR-B',start:0,end:4}],
 [{publicId:'USR-A',start:-1,end:4}],
 ])('rejects invalid or overlapping mentions %j',async input=>expect(resolveRoomMentions(db,'@Ali',input,members)).rejects.toMatchObject({code:'VALIDATION_ERROR'}));
 it('keeps mentions identical in ack, live and history serializers',async()=>{
  const mentions=await resolveRoomMentions(db,'@Ali',[{publicId:'USR-B',start:0,end:4}],members);
  const message={publicId:'MSG',senderPublicId:'USR-A',senderName:'Ali',body:'@Ali',mentions,createdAt:new Date()};
  expect(plainRoomMessage(message).mentions).toEqual(mentions);
  expect((await serializeRoomChatMessages([message],'',new Map()))[0].mentions).toEqual(mentions);
  expect(plainRoomMessage({...message,mentions:undefined}).mentions).toEqual([]);
 });
});
