import { it, expect, vi } from 'vitest';
import { createMediaByteCache } from './media-byte-cache.js';
const file = (version = 'v1', size = 3) => ({ fileData: Buffer.alloc(size), mediaVersion: version });
it('coalesces concurrent loads and keeps versions and posters separate', async () => {
  const cache = createMediaByteCache(), load = vi.fn(async () => file());
  await Promise.all(Array.from({ length: 20 }, () => cache.get('a', false, 'v1', load)));
  await cache.get('a', false, 'v1', load); expect(load).toHaveBeenCalledTimes(1);
  const replacement = vi.fn(async () => file('v2'));
  await cache.get('a', false, 'v2', replacement); expect(replacement).toHaveBeenCalledTimes(1);
  const poster = vi.fn(async () => ({posterFileData:Buffer.from('p'),posterMediaVersion:'v1'}));
  await cache.get('a', true, 'v1', poster); expect(poster).toHaveBeenCalledTimes(1);
});
it('bounds bytes, entry count and lifetime using least recently used eviction', async () => {
  let time = 0;
  const cache = createMediaByteCache({maxBytes:6,maxItemBytes:4,maxEntries:2,ttlMs:10,now:()=>time});
  const load = vi.fn(async () => file());
  await cache.get('a',false,'v1',load);await cache.get('b',false,'v1',load);
  await cache.get('a',false,'v1',load);await cache.get('c',false,'v1',load);
  await cache.get('a',false,'v1',load);expect(load).toHaveBeenCalledTimes(3);
  await cache.get('b',false,'v1',load);expect(load).toHaveBeenCalledTimes(4);
  time=11;await cache.get('b',false,'v1',load);expect(load).toHaveBeenCalledTimes(5);
});
it('does not retain oversized, unversioned, missing, replaced or failed reads', async () => {
  const cache=createMediaByteCache({maxItemBytes:2});
  for (const [version,value] of [['v1',file()], [null,file('v1',1)], ['v1',null], ['v1',file('v2',1)]]) {
    const load=vi.fn(async()=>value);await cache.get('a',false,version,load);await cache.get('a',false,version,load);expect(load).toHaveBeenCalledTimes(2);
  }
  const fail=vi.fn(async()=>{throw Error('unavailable')});
  await expect(cache.get('a',false,'v1',fail)).rejects.toThrow('unavailable');
  await expect(cache.get('a',false,'v1',fail)).rejects.toThrow('unavailable');expect(fail).toHaveBeenCalledTimes(2);
});
