import {test,expect,vi} from 'vitest';
import {refreshReactionDelivery} from './message-reaction-delivery.js';
test('delayed reaction updates carry current text and cannot resurrect a deleted message',async()=>{
 const record={body:'edited',editedAt:new Date(),reactions:[{emoji:'❤️',userId:'a'}]};
 const db={conversationParticipant:{findFirst:vi.fn(async()=>({userId:'a',conversationId:'c'}))},message:{findFirst:vi.fn(async()=>record)}};
 const row={channel:'user:A',payload:{conversationId:'C',message:{id:'M',body:'old',reactions:[]}}};
 expect((await refreshReactionDelivery(db,row)).message).toMatchObject({body:'edited',reactions:[{emoji:'❤️',count:1,mine:true}]});
 record.deletedAt=new Date();expect((await refreshReactionDelivery(db,row)).message).toMatchObject({body:null,reactions:[],voice:null,media:null});
 db.conversationParticipant.findFirst.mockResolvedValue(null);expect(await refreshReactionDelivery(db,row)).toBeNull();
});
