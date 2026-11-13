import { it,expect,vi } from 'vitest';
vi.mock('./prisma.js',()=>({prisma:{}}));
import { nextRoomRewardDay,roomRewardAmount,payRoomReward,maintainRoomRewards,roomRewardPayoutDto } from './room-rewards.js';
it('refuses historical pending payouts even through direct calls',async()=>{const {tx,db}=fixture();tx.roomRewardActivation.findUnique=async()=>({startsAt:nextRoomRewardDay()});await expect(payRoomReward('reward',db)).rejects.toThrow('historical payout blocked');expect(tx.user.updateMany).not.toHaveBeenCalled();expect(tx.walletTransaction.create).not.toHaveBeenCalled();});
it('fails closed without an activation record',async()=>{const snapshot=vi.fn();await maintainRoomRewards({roomRewardActivation:{findUnique:async()=>null},$transaction:snapshot});expect(snapshot).not.toHaveBeenCalled();});
it('snapshots only the first completed eligible day, with a unique receipt',async()=>{
 const startsAt=new Date();startsAt.setUTCHours(0,0,0,0);startsAt.setUTCDate(startsAt.getUTCDate()-1);
 const create=vi.fn(),receipt=vi.fn(),query=vi.fn(async()=>[{roomId:'ROOM-1',ownerId:'owner',coins:10000n,giftIds:['gift']}]);
 const db={roomRewardActivation:{findUnique:async()=>({startsAt})},$executeRaw:vi.fn(),roomRewardPolicy:{findMany:async()=>[{effectiveFrom:new Date('2020-01-01'),version:1,enabled:true,rateBps:200}]},roomRewardDay:{findFirst:async()=>null},roomRewardPayout:{findMany:async()=>[]},$transaction:async fn=>fn({roomRewardDay:{create:receipt},$queryRaw:query,roomRewardPayout:{create}})};
 await maintainRoomRewards(db);expect(receipt).toHaveBeenCalledTimes(1);expect(receipt).toHaveBeenCalledWith({data:{day:startsAt,policyVersion:1}});expect(create).toHaveBeenCalledWith({data:expect.objectContaining({day:startsAt,coins:200n,currency:'COINS',diamonds:0n,giftCoins:10000n,rateBps:200})});
});
it('does not backfill an old enabled policy or old day receipt',async()=>{const snapshot=vi.fn(),pending=vi.fn(async()=>[]),startsAt=nextRoomRewardDay();await maintainRoomRewards({roomRewardActivation:{findUnique:async()=>({startsAt})},$executeRaw:vi.fn(),roomRewardPolicy:{findMany:async()=>[{effectiveFrom:new Date('2020-01-01'),version:1,enabled:true,rateBps:200}]},roomRewardDay:{findFirst:async()=>({day:new Date('2020-01-02')})},roomRewardPayout:{findMany:pending},$transaction:snapshot});expect(snapshot).not.toHaveBeenCalled();expect(pending).toHaveBeenCalledWith(expect.objectContaining({where:{status:'PENDING',day:{gte:startsAt}}}));});
it('starts at next midnight UTC, including month boundaries',()=>{expect(nextRoomRewardDay(new Date('2026-10-31T23:59:59Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');expect(nextRoomRewardDay(new Date('2026-10-18T00:00:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z');});
it('uses exact integer arithmetic and rounds once on the daily total',()=>{expect(roomRewardAmount(100000n,200)).toBe(2000n);expect(roomRewardAmount(49n,200)).toBe(0n);expect(roomRewardAmount(50n,200)).toBe(1n);expect(roomRewardAmount(900719925474099300n,200)).toBe(18014398509481986n);expect(()=>roomRewardAmount(1n,10001)).toThrow();});
function fixture(){const row={id:'reward',status:'PENDING',ownerId:'owner',roomId:'ROOM-1',day:new Date('2026-01-01'),diamonds:2000n,giftCoins:100000n,giftIds:['gift'],rateBps:200,policyVersion:1};const tx={audioRoom:{findUnique:async()=>({title:'QA room'})},roomRewardActivation:{findUnique:async()=>({startsAt:new Date('2025-01-01')})},$queryRaw:vi.fn(),giftTransaction:{count:async()=>0},roomRewardPayout:{findUnique:async()=>row,update:async({data})=>Object.assign(row,data)},user:{findUnique:async()=>({status:'ACTIVE'}),updateMany:vi.fn(async()=>({count:1}))},ban:{findFirst:async()=>null},walletTransaction:{create:vi.fn()},notification:{upsert:vi.fn()},auditLog:{create:vi.fn()}};return {row,tx,db:{$transaction:async f=>f(tx)}};}
it('credits owner Coins once, with ledger and notification, on retry',async()=>{const {tx,db,row}=fixture();await payRoomReward('reward',db);await payRoomReward('reward',db);expect(tx.user.updateMany).toHaveBeenCalledTimes(1);expect(tx.user.updateMany.mock.calls[0][0].data).toEqual({coinBalance:{increment:2000n},walletRevision:{increment:1}});expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);expect(tx.notification.upsert).toHaveBeenCalledTimes(1);expect(row.status).toBe('PAID');});
it('holds banned owners and refunds without crediting',async()=>{const {tx,db}=fixture();tx.ban.findFirst=async()=>({id:'ban'});await expect(payRoomReward('reward',db)).rejects.toThrow('unavailable');expect(tx.user.updateMany).not.toHaveBeenCalled();tx.ban.findFirst=async()=>null;tx.giftTransaction.count=async()=>1;await expect(payRoomReward('reward',db)).rejects.toThrow('refunded');expect(tx.user.updateMany).not.toHaveBeenCalled();});
it('does not complete receipt after a ledger failure',async()=>{const {tx,db,row}=fixture();tx.walletTransaction.create.mockRejectedValue(new Error('ledger unavailable'));await expect(payRoomReward('reward',db)).rejects.toThrow();expect(row.status).toBe('PENDING');expect(tx.notification.upsert).not.toHaveBeenCalled();});
it('does not snapshot past days when policy starts tomorrow',async()=>{const snapshot=vi.fn();const db={roomRewardActivation:{findUnique:async()=>({startsAt:nextRoomRewardDay()})},$executeRaw:vi.fn(),roomRewardPolicy:{findMany:async()=>[{effectiveFrom:nextRoomRewardDay(),rateBps:200,enabled:true}]},roomRewardDay:{findFirst:async()=>null},roomRewardPayout:{findMany:async()=>[]},$transaction:snapshot};await maintainRoomRewards(db);expect(snapshot).not.toHaveBeenCalled();});
it('pays new Coin snapshots with no Diamond ledger movement and a Coin notification',async()=>{
 const {row,tx,db}=fixture();Object.assign(row,{coins:2000n,currency:'COINS',diamonds:0n});
 await payRoomReward(row.id,db);
 expect(tx.walletTransaction.create).toHaveBeenCalledWith({data:expect.objectContaining({coins:2000n,diamonds:null,referenceId:'room-reward:reward'})});
 expect(tx.notification.upsert.mock.calls[0][0].create).toMatchObject({type:'ROOM_REWARD',body:'2000 Coins are earned by the Room owner on 2026-01-01',action:{screen:'WALLET',rewardCurrency:'COINS',coins:'2000'}});
 expect(row).toMatchObject({status:'PAID',coins:2000n,diamonds:0n,currency:'COINS'});
});
it('converts unpaid legacy snapshots but never repays or relabels paid Diamond rewards',async()=>{
 const {row,tx,db}=fixture();
 expect(roomRewardPayoutDto(row)).toMatchObject({currency:'COINS',coins:'2000',diamonds:'0'});
 Object.assign(row,{status:'PAID',paidAt:new Date(),currency:'DIAMONDS',coins:null});
 await payRoomReward(row.id,db);expect(tx.user.updateMany).not.toHaveBeenCalled();
 expect(roomRewardPayoutDto(row)).toMatchObject({currency:'DIAMONDS',coins:null,diamonds:'2000'});
 row.status='REVIEW_PAID';await payRoomReward(row.id,db);expect(tx.user.updateMany).not.toHaveBeenCalled();
});
it('rejects an inconsistent Coin snapshot and Coin wallet overflow before ledger creation',async()=>{
 const {row,tx,db}=fixture();row.coins=1999n;
 await expect(payRoomReward(row.id,db)).rejects.toThrow('reconciliation');expect(tx.user.updateMany).not.toHaveBeenCalled();
 row.coins=2000n;tx.user.updateMany.mockResolvedValue({count:0});
 await expect(payRoomReward(row.id,db)).rejects.toThrow('Coin balance');expect(tx.walletTransaction.create).not.toHaveBeenCalled();
 expect(tx.user.updateMany.mock.calls[0][0].where).toEqual({id:'owner',coinBalance:{lte:9223372036854773807n}});
});
it('uses a complete midnight-to-midnight UTC+7 cycle after timezone transition',()=>{
 vi.stubEnv('NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT','2026-11-15T00:00:00Z');
 try{
  const start=new Date('2026-12-01T17:00:00Z'),end=nextRoomRewardDay(start);
  expect(end.toISOString()).toBe('2026-12-02T17:00:00.000Z');expect(+end-+start).toBe(24*60*60*1000);
 }finally{vi.unstubAllEnvs();}
});
