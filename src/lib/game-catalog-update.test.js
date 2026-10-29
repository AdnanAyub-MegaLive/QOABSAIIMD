import { afterEach, expect, it, vi } from 'vitest';
import { notifyGameCatalogUpdated, notifyGameIconUpdated } from './game-catalog-update.js';
afterEach(() => { vi.restoreAllMocks(); delete globalThis.portalIo; });
it('broadcasts only revision, game IDs and time with decimal-string revisions', async () => {
  const io = { emit: vi.fn() };
  const db = { $queryRaw: vi.fn().mockResolvedValueOnce([{revision:'9007199254740993'}]).mockResolvedValueOnce([{revision:'9007199254740994'}]) };
  await notifyGameCatalogUpdated(db, ['b','a','a'], io);
  await notifyGameCatalogUpdated(db, ['a'], io);
  expect(io.emit.mock.calls[0]).toEqual(['games:catalog-updated', {success:true,data:{revision:'9007199254740993',gameIds:['a','b'],changedAt:expect.any(String)}}]);
  expect(io.emit.mock.calls[1][1].data.revision).toBe('9007199254740994');
});
it('never fails a committed admin operation when delivery fails', async () => {
  vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(await notifyGameCatalogUpdated({$queryRaw:async()=>[{revision:'1'}]}, ['a'], {emit:()=>{throw new Error('offline');}})).toBeNull();
});
it('notifies only games referencing the replaced icon', async () => {
  globalThis.portalIo={emit:vi.fn()};
  const db={$queryRaw:async()=>[{revision:'3'}],gameDefinition:{findMany:vi.fn().mockResolvedValue([{id:'pizza'}])}};
  await notifyGameIconUpdated(db,'AST-icon');
  expect(db.gameDefinition.findMany).toHaveBeenCalledWith({where:{archivedAt:null,settings:{path:['iconAssetId'],equals:'AST-icon'}},select:{id:true}});
  expect(globalThis.portalIo.emit.mock.calls[0][1].data.gameIds).toEqual(['pizza']);
});
