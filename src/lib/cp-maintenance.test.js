import { describe, expect, it } from 'vitest';
import { nextCpReview, settleCpMaintenance } from './cp-maintenance.js';

const levels = [1,2,3,4,5].map(level => ({
  level, enabled:true, minExp:BigInt(level - 1)*100n, maintenanceMinCoins:BigInt(level)*10n,
}));
const due = new Date('2026-12-01T00:00:00Z');
function review(level, coins, now=due, settings=levels) {
  const row={id:'cp',status:'ACTIVE',exp:levels[level-1].minExp,level,maintenanceCoins:coins,maintenanceDueAt:due};
  const tx={profileRelationship:{update:({data})=>({...row,...data})}};
  return settleCpMaintenance(tx,row,settings,now);
}
describe('30-day CP reviews',()=>{
  it('waits until the boundary',async()=>{
    expect(await review(1,0n,new Date(+due-1))).toMatchObject({status:'ACTIVE',maintenanceDueAt:due});
  });
  it('expires below the level one minimum even with some gifts',async()=>{
    expect(await review(1,9n)).toMatchObject({status:'EXPIRED',expiresAt:due,maintenanceDueAt:null});
  });
  it('renews at the exact target and starts fresh',async()=>{
    expect(await review(1,10n)).toMatchObject({status:'ACTIVE',level:1,maintenanceCoins:0n,maintenanceDueAt:nextCpReview(due)});
  });
  it('drops exactly one enabled level on a miss',async()=>{
    expect(await review(5,49n)).toMatchObject({status:'ACTIVE',level:4,exp:300n});
  });
  it('evaluates each missed period after server downtime',async()=>{
    expect(await review(3,0n,nextCpReview(nextCpReview(due)))).toMatchObject({status:'EXPIRED',level:1,expiresAt:nextCpReview(nextCpReview(due))});
  });
  it('requires activity even with a zero target',async()=>{
    expect(await review(1,0n,due,[{...levels[0],maintenanceMinCoins:0n}])).toMatchObject({status:'EXPIRED'});
  });
});
