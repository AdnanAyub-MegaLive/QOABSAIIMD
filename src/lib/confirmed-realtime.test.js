import { expect, test, vi } from 'vitest';
import { flushConfirmedRealtime } from './confirmed-realtime.js';
function fixture() {
  const emit=vi.fn(), io={to:vi.fn(()=>({emit}))};
  const rows=[{id:'private-internal-event-id',event:'wallet:updated',userId:'internal',payload:{walletRevision:'9',balances:{coins:'999999999999999999'}},createdAt:new Date()}];
  const db={confirmedRealtimeEvent:{findMany:vi.fn(async()=>rows),updateMany:vi.fn(async()=>({count:1}))},user:{findMany:vi.fn(async()=>[{id:'internal',publicId:'USR-QA'}])}};
  return {db,io,emit,rows};
}
test('wallet remains private, decimal exact and opaque ID stable after marker failure', async()=>{
  const {db,io,emit}=fixture();
  db.confirmedRealtimeEvent.updateMany.mockRejectedValueOnce(new Error('marker unavailable'));
  await expect(flushConfirmedRealtime(db,io)).rejects.toThrow('marker unavailable');
  await flushConfirmedRealtime(db,io);
  expect(emit).toHaveBeenCalledTimes(1);
  expect(io.to).toHaveBeenCalledWith('user:USR-QA');
  const data=emit.mock.calls[0][1].data;
  expect(data.eventId).toMatch(/^[a-f0-9]{64}$/);
  expect(data.balances.coins).toBe('999999999999999999');
});
test('emit failure stays pending and retry uses same event ID', async()=>{
  const {db,io,emit}=fixture();
  emit.mockImplementationOnce(()=>{throw new Error('socket unavailable')});
  await flushConfirmedRealtime(db,io);
  expect(db.confirmedRealtimeEvent.updateMany).not.toHaveBeenCalled();
  await flushConfirmedRealtime(db,io);
  expect(emit.mock.calls[0][1].data.eventId).toBe(emit.mock.calls[1][1].data.eventId);
});
test('room event contains public recipient IDs and independently comparable revisions',async()=>{
  const {db,io,emit,rows}=fixture();
  rows[0]={...rows[0],userId:null,roomId:'R',event:'audio-room:gift-totals',payload:{roomTotalsRevision:'12',roomTotalCoins:'100',changedRecipients:{internal:'75'}}};
  await flushConfirmedRealtime(db,io);
  expect(io.to).toHaveBeenCalledWith('audio-room:R');
  const data=emit.mock.calls[0][1].data;
  expect(data.changedRecipients).toBeUndefined();
  expect(data.recipients).toEqual([{userId:'USR-QA',receivedGiftCoins:'75',revision:'12'}]);
});
test('a wake during dispatch schedules a further pass', async()=>{
  const {db,io}=fixture(); let release;
  db.confirmedRealtimeEvent.findMany.mockImplementationOnce(()=>new Promise(r=>{release=r})).mockResolvedValue([]);
  const first=flushConfirmedRealtime(db,io);
  const second=flushConfirmedRealtime(db,io);
  release([]); await Promise.all([first,second]);
  expect(db.confirmedRealtimeEvent.findMany).toHaveBeenCalledTimes(2);
});
