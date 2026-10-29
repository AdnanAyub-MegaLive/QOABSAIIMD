import { expect,it,vi } from 'vitest';
vi.mock('./gift-media.js',()=>({giftMedia:()=>({mediaUrl:'https://server.test/art.png'})}));
import { roomGiftPreview,registerRoomGiftPreviews } from './room-gift-preview.js';
function fixture(){
 const db={audioRoom:{findUnique:vi.fn().mockResolvedValue({status:'LIVE',isBlocked:false,owner:{publicId:'owner'},seats:[{occupant:{publicId:'target'}}]})},uploadAsset:{findFirst:vi.fn().mockResolvedValue({publicId:'gift',name:'Lucky'})}};
 const emit=vi.fn(),socket={rooms:new Set(['audio-room:r']),to:vi.fn(()=>({volatile:{emit}})),on:vi.fn()};
 const user={publicId:'sender',name:'Sender'};
 const input={roomId:'r',giftId:'gift',giftBatchId:'batch',quantity:1,recipientIds:['target']};
 return {db,socket,user,input,emit};
}
it('builds only visual data from trusted identity and artwork, with no financial writes',async()=>{
 const f=fixture();const result=await roomGiftPreview(f.db,f.socket,f.user,{...f.input,sender:{publicId:'spoof'},gift:{mediaUrl:'https://attacker.test'},lucky:{rewardCoins:'999'}},'https://portal.test',1000);
 expect(result.sender.publicId).toBe('sender');expect(result.gift.mediaUrl).toBe('https://server.test/art.png');
 expect(result.preview).toBe(true);expect(result).not.toHaveProperty('lucky');expect(result).not.toHaveProperty('totalCoins');
 expect(result.expiresAt).toBe(new Date(4000).toISOString());
});
it('rejects outsiders, unseated recipients, invalid gifts and invalid quantities',async()=>{
 const f=fixture();f.socket.rooms.clear();await expect(roomGiftPreview(f.db,f.socket,f.user,f.input,'')).rejects.toMatchObject({code:'JOIN_ROOM_FIRST'});
 f.socket.rooms.add('audio-room:r');await expect(roomGiftPreview(f.db,f.socket,f.user,{...f.input,recipientIds:['outsider']},'')).rejects.toMatchObject({code:'ROOM_PARTICIPANT_REQUIRED'});
 f.db.uploadAsset.findFirst.mockResolvedValue(null);await expect(roomGiftPreview(f.db,f.socket,f.user,f.input,'')).rejects.toMatchObject({code:'GIFT_NOT_FOUND'});
 await expect(roomGiftPreview(f.db,f.socket,f.user,{...f.input,quantity:0},'')).rejects.toMatchObject({code:'VALIDATION_ERROR'});
});
it('deduplicates taps, uses volatile delivery and never relays to the sending socket',async()=>{
 const f=fixture();registerRoomGiftPreviews({...f,origin:'https://portal.test',now:()=>1000});const handler=f.socket.on.mock.calls[0][1];
 await handler({...f.input,previewId:'tap-1'});await handler({...f.input,previewId:'tap-1'});
 expect(f.emit).toHaveBeenCalledTimes(1);expect(f.socket.to).toHaveBeenCalledWith('audio-room:r');
 expect(f.emit.mock.calls[0][0]).toBe('audio-room:gift-preview');
});
it('relays every tap sharing a combo batch and acknowledges duplicates',async()=>{
 const f=fixture();registerRoomGiftPreviews({...f,origin:'',now:()=>1000});const handler=f.socket.on.mock.calls[0][1],ack=vi.fn();
 await handler({...f.input,previewId:'tap-1'},ack);await handler({...f.input,previewId:'tap-2'},ack);await handler({...f.input,previewId:'tap-2'},ack);
 expect(f.emit).toHaveBeenCalledTimes(2);expect(ack).toHaveBeenCalledTimes(3);expect(ack.mock.calls[2][0]).toMatchObject({success:true,data:{duplicate:true}});
});
it('does not drop legacy taps with a shared batch and no per-tap ID',async()=>{
 const f=fixture();registerRoomGiftPreviews({...f,origin:'',now:()=>1000});const handler=f.socket.on.mock.calls[0][1];
 await handler(f.input);await handler(f.input);expect(f.emit).toHaveBeenCalledTimes(2);
 expect(f.emit.mock.calls[0][1].data.previewId).not.toBe(f.emit.mock.calls[1][1].data.previewId);
});
it('acknowledges throttled previews and allows retry after a failed validation lookup',async()=>{
 const f=fixture();registerRoomGiftPreviews({...f,origin:'',now:()=>1000});const handler=f.socket.on.mock.calls[0][1],ack=vi.fn();
 f.db.uploadAsset.findFirst.mockResolvedValueOnce(null);
 await handler({...f.input,previewId:'retry'},ack);await handler({...f.input,previewId:'retry'},ack);
 expect(ack.mock.calls[0][0].success).toBe(false);expect(ack.mock.calls[1][0].success).toBe(true);
 for(let i=0;i<30;i++)await handler({...f.input,previewId:`tap-${i}`},ack);
 expect(ack.mock.calls.at(-1)[0]).toMatchObject({success:false,error:{code:'PREVIEW_RATE_LIMITED'}});
});
it('drops stale previews and caps a burst',async()=>{
 const f=fixture();let time=1000;registerRoomGiftPreviews({...f,origin:'',now:()=>time});const handler=f.socket.on.mock.calls[0][1];
 f.db.uploadAsset.findFirst.mockImplementation(async()=>{time=5000;return {publicId:'gift',name:'Lucky'};});await handler(f.input);expect(f.emit).not.toHaveBeenCalled();
 f.db.uploadAsset.findFirst.mockResolvedValue({publicId:'gift',name:'Lucky'});
 for(let i=0;i<40;i++)await handler({...f.input,giftBatchId:`next-${i}`});
 expect(f.emit.mock.calls.length).toBe(30);
});
