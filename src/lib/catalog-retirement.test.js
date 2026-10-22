import {expect,it,vi} from 'vitest';
import {retireCatalogItem} from './catalog-retirement.js';
import {visibleGames} from './game-control/catalog.mjs';
import {dispatchNotifications} from './action-notifications.js';
const admin={id:'admin',role:'SUPER_ADMIN'};
function fixture(){
 const row={id:'one',settings:{status:'active'},revision:7};
 const model={findUnique:vi.fn(async()=>row),update:vi.fn(async({data})=>Object.assign(row,data))};
 const tx={$queryRaw:vi.fn(),gameDefinition:model,notification:model,auditLog:{create:vi.fn()}};
 return {row,model,tx,db:{$transaction:fn=>fn(tx)}};
}
it.each(['game','notification'])('retires %s once with no settings, access or history writes',async kind=>{
 const f=fixture(),input={id:'one',reason:'No longer listed'};
 const result=await retireCatalogItem(f.db,admin,kind,input);
 expect(await retireCatalogItem(f.db,admin,kind,input)).toEqual(result);
 expect(f.model.update).toHaveBeenCalledTimes(1);expect(f.tx.auditLog.create).toHaveBeenCalledTimes(1);
 expect(Object.keys(f.model.update.mock.calls[0][0].data)).toEqual([kind==='game'?'archivedAt':'retractedAt']);
 expect(f.row.settings.status).toBe('active');expect(f.row.revision).toBe(7);
});
it.each([null,{id:'other',role:'ADMIN'}])('rejects unauthorized retirement',async actor=>{
 const f=fixture();await expect(retireCatalogItem(f.db,actor,'game',{id:'one',reason:'Test'})).rejects.toMatchObject({status:actor?403:401});expect(f.tx.$queryRaw).not.toHaveBeenCalled();
});
it('requires a reason and reports missing records',async()=>{
 const f=fixture();await expect(retireCatalogItem(f.db,admin,'game',{id:'one',reason:''})).rejects.toMatchObject({status:422});
 f.model.findUnique.mockResolvedValue(null);await expect(retireCatalogItem(f.db,admin,'game',{id:'missing',reason:'Test'})).rejects.toMatchObject({status:404});
});
it('hides archived games without pausing them',()=>{
 const game={id:'one',engine:'external',status:'active',launchUrl:'https://example.com',archivedAt:new Date().toISOString()};
 expect(visibleGames([game], 'https://portal.test')).toEqual([]);expect(game.status).toBe('active');
});
it('does not dispatch a notification retracted after batch selection',async()=>{
 const f=fixture();f.row.retractedAt=new Date();f.model.findMany=async()=>[{id:'one'}];
 const emit=vi.fn();await dispatchNotifications({...f.db,notification:f.model},{emit});
 expect(emit).not.toHaveBeenCalled();expect(f.model.update).not.toHaveBeenCalled();
});
