import {it,expect,vi} from 'vitest';
import {recordGiftRecovery} from './gift-refunds.js';
import {addDailyTaskProgress} from './daily-tasks.js';
it('known settlement and explicit no-PK produce the same recovery record without lookups',async()=>{
 const tx={giftRecoverySnapshot:{create:vi.fn()},giftSettlement:{findUnique:vi.fn()},audioRoomPkSession:{findFirst:vi.fn()}};
 await recordGiftRecovery(tx,{id:'g',roomId:'room',senderId:'s',recipientUserId:'r',coinValue:100n,quantity:1},{source:'COINS',luckyCoins:20n,settlement:{recipientDiamonds:10n,agencyCoins:0n},pk:null});
 expect(tx.giftSettlement.findUnique).not.toHaveBeenCalled();expect(tx.audioRoomPkSession.findFirst).not.toHaveBeenCalled();
 expect(tx.giftRecoverySnapshot.create.mock.calls[0][0].data.data).toMatchObject({coins:'100',diamonds:'10',luckyCoins:'20',manualReason:null});
});
it('derived gift task metrics do not query or mutate task instances',async()=>{
 await expect(addDailyTaskProgress('s','SEND_GIFTS',1,new Date(),{})).resolves.toBeUndefined();
 await expect(addDailyTaskProgress('s','TOP_SUPPORTER',1,new Date(),{})).resolves.toBeUndefined();
});
