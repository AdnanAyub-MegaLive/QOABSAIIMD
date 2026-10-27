import {it,expect} from 'vitest';
import {roundSummary} from './round-summary.mjs';
it('adds every repeated bet and payout, including losses',()=>{
 expect(roundSummary([{amount:'100',status:'SETTLED',result:{payout:200}},{amount:'100',status:'SETTLED',result:{payout:200}},{amount:'100',status:'SETTLED',result:{payout:0}}])).toEqual({wager:'300',payout:'400',net:'100',pending:0,count:3});
});
it('marks incomplete settlement and preserves exact large coin values',()=>{
 expect(roundSummary([{amount:'9007199254740993',status:'SETTLED',result:{payout:'9007199254740994'}},{amount:'100',status:'PENDING'}])).toEqual({wager:'9007199254741093',payout:'9007199254740994',net:'-99',pending:1,count:2});
});
