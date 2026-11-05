import { it, expect, vi } from 'vitest';
vi.mock('./messaging.js',()=>({ serializeMessage: row => ({ id: row.publicId, type: row.kind, metadata: row.metadata, body: row.body }) }));
import { relationshipChatMessage } from './relationship-chat.js';
it.each(['REQUEST','ACCEPT','REJECT'])('writes %s into the direct inbox with system metadata and durable delivery',async action=>{
  const tx={
    conversation:{upsert:vi.fn(async()=>({id:'c',publicId:'CONV-1'})),update:vi.fn()},
    conversationParticipant:{update:vi.fn()},messageReceipt:{create:vi.fn()},
    message:{create:vi.fn(async({data})=>({...data,id:'m',createdAt:new Date()}))},
    realtimeOutbox:{createMany:vi.fn()},notification:{create:vi.fn()},userFollow:{count:vi.fn()},
  };
  await relationshipChatMessage(tx,{publicId:'REL-1'},{id:'a',publicId:'USR-A',name:'Alice'},{id:'b',publicId:'USR-B'},action);
  expect(tx.conversation.upsert.mock.calls[0][0].where.directKey).toBe('a:b');
  expect(tx.message.create.mock.calls[0][0].data).toMatchObject({kind:'RELATIONSHIP',senderId:'a',metadata:{relationshipId:'REL-1',type:'CP',action}});
  expect(tx.realtimeOutbox.createMany.mock.calls[0][0].data.map(row=>row.channel)).toEqual(['user:USR-A','user:USR-B']);
  expect(tx.notification.create).not.toHaveBeenCalled();expect(tx.userFollow.count).not.toHaveBeenCalled();
});
