import {it,expect,vi} from 'vitest';
import {createFoodTapQueue} from './food-tap-queue.mjs';
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
it('preserves every rapid tap and refreshes after draining',async()=>{
 let resolve;const send=vi.fn().mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue({});
 const refresh=vi.fn().mockResolvedValue();
 const queue=createFoodTapQueue({send,refresh,onChange:()=>{},onError:()=>{}});
 for(let i=0;i<12;i++)queue.add({id:String(i),amount:100,choice:'corn'});
 expect(send).toHaveBeenCalledTimes(1);resolve();await flush();
 expect(send.mock.calls.map(([p])=>p.id)).toEqual(Array.from({length:12},(_,i)=>String(i)));
 expect(refresh).toHaveBeenCalledTimes(1);
 queue.reconcile(['0','1']);expect(queue.pending()).toHaveLength(10);queue.stop();
});
it('reuses the same immutable request after a lost receipt',async()=>{
 const payload={id:'one-tap',choice:'corn',amount:100};
 const send=vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({});
 const queue=createFoodTapQueue({send,refresh:async()=>{},onChange:()=>{},onError:()=>{},wait:async()=>{}});
 queue.add(payload);await flush();expect(send).toHaveBeenCalledTimes(2);
 expect(send.mock.calls[0][0]).toBe(send.mock.calls[1][0]);queue.stop();
});
it('reports rejected bets and continues to later taps without retrying a closed round',async()=>{
 const send=vi.fn().mockRejectedValueOnce(Object.assign(new Error('Entry closed'),{status:409})).mockResolvedValue({});
 const error=vi.fn();const queue=createFoodTapQueue({send,refresh:async()=>{},onChange:()=>{},onError:error});
 queue.add({id:'a'});queue.add({id:'b'});await flush();
 expect(error).toHaveBeenCalledWith('Entry closed');expect(send).toHaveBeenCalledTimes(2);
 expect(queue.pending()).toEqual([{id:'b'}]);queue.stop();
});
