export function roundSummary(entries = []) {
 let wager=0n,payout=0n,pending=0;
 for(const e of entries){wager+=BigInt(e.amount);if(e.status==='SETTLED'&&e.result)payout+=BigInt(e.result.payout??0);else pending++;}
 return {wager:String(wager),payout:String(payout),net:String(payout-wager),pending,count:entries.length};
}
