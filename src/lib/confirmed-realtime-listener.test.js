import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
const state=vi.hoisted(()=>({clients:[]}));
vi.mock('pg',()=>({Client:class extends EventEmitter {
  constructor(){super();state.clients.push(this)}
  async connect(){}
  async query(sql){this.sql=sql}
  async end(){}
}}));
import { startConfirmedRealtimeListener } from './confirmed-realtime-listener.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('coalesces post-commit wakes and dispatches wallet independently of slow announcements',async()=>{
  const wallet=vi.fn(), notifications=vi.fn(), announcements=vi.fn(()=>new Promise(()=>{}));
  const stop=startConfirmedRealtimeListener({connectionString:'unused',wallet,notifications,announcements});
  await tick();await tick();
  const client=state.clients.at(-1);
  expect(client.sql).toBe('LISTEN portal_confirmed_realtime');
  wallet.mockClear();
  for(let i=0;i<50;i++) client.emit('notification',{channel:'portal_confirmed_realtime',payload:i%2?'wallet':'room'});
  await tick();await tick();
  expect(wallet).toHaveBeenCalledTimes(1);
  expect(notifications).toHaveBeenCalledTimes(1);
  await stop();
  client.emit('notification',{channel:'portal_confirmed_realtime',payload:'wallet'});
  await tick(); expect(wallet).toHaveBeenCalledTimes(1);
});
