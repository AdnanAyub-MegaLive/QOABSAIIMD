import {it,expect} from 'vitest';
import {agencyShares,salaryProgress,salaryUsd,hostWithdrawalPolicy} from './host-salary.js';
const tiers=[{level:1,target:450000,percent:1},{level:2,target:900000,percent:1},{level:3,target:1350000,percent:3}];
it('separates actual earnings from target-based commission and counts both agencies once',()=>{
 const result=salaryProgress(1000000n,tiers);
 expect(result).toMatchObject({level:2,earnedUsd:'11.11',remaining:'350000'});
 expect(agencyShares(new Map([['a',750000n],['b',250000n]]),result.current)).toEqual({a:'6750',b:'2250'});
 expect(salaryUsd(9000n)).toBe('0.10');
});
it('gates hosts on verified gift earnings rather than spendable balance',async()=>{
 const user={id:'u',appRoles:['HOST'],hostSalaryCoinBalance:1000000n};
 const tx={reportingCyclePolicy:{findMany:async()=>[]},hostSalarySchedule:{findFirst:async()=>({tiers})},giftSettlement:{findMany:async()=>[{recipientDiamonds:449999n}]}};
 await expect(hostWithdrawalPolicy(tx,user,{rules:{}})).rejects.toMatchObject({code:'HOST_SALARY_LEVEL_REQUIRED'});
 tx.giftSettlement.findMany=async()=>[{recipientDiamonds:450000n}];
 expect((await hostWithdrawalPolicy(tx,{...user,hostSalaryCoinBalance:0n},{rules:{}})).rules.withdrawalDiamondsPerUsd).toBe('90000');
});
