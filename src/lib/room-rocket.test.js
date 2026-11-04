import { it, expect, vi, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
vi.mock('./prisma.js', () => ({ prisma: {} }));
vi.mock('./progression.js', () => ({ appendOutbox: async (tx, room, event, data) => tx.events.push({room,event,data}) }));
vi.mock('./wallet.js', () => ({ ledgerData: data => data }));
vi.mock('./props-store.js', () => ({ equippablePropCategories: new Set(['FRAMES']) }));
vi.mock('./vip-capabilities.js', () => ({ hasVipPrivilege: async id => id === 'hidden' }));
vi.mock('./decoration-media.js', () => ({ decorationMedia: asset => ({url:`https://media.test/${asset.publicId}`}) }));
vi.mock('./room-rankings.js', () => ({ requireRankingRoom: async () => ({id:'room',status:'LIVE'}) }));
import { getRoomRocketResults, requireRocketRoom } from './room-rocket-api.js';
import { validateRocketConfig, allocateRocketCoins, drawRocketWinners } from './room-rocket-contract.js';
import { saveRocketConfiguration, recordRocketGift, reverseRocketGift, currentRocketSeason, payRocketLaunch, rocketSnapshot, displayRocketRewards } from './room-rocket.js';

const now = new Date('2026-11-02T12:00:00Z');
function config() { return validateRocketConfig({enabled:true,title:'Rocket',rules:'Rules',endsAt:'2026-11-03T00:00:00Z',repeatDays:15,stages:[100,200,300].map(target=>({targetCoins:String(target),rewards:{top1:[{type:'COINS',amount:'5'}]}}))}); }
function fixture() {
 const state={season:{id:'season',startsAt:new Date('2026-11-02'),endsAt:new Date('2026-11-03'),config:config()},progress:null,gifts:new Map(),contributions:new Map(),launches:new Map(),users:new Map(['s','r','owner','hidden'].map(id=>[id,{id,publicId:`USR-${id}`,name:id,coinBalance:0n}])),ledger:[],notifications:new Map()};
 const key=k=>[k.campaignId,k.roomId,k.level,k.userId].join(':');
 const tx={events:[],
  roomRocketSettings:{findUnique:async()=>({enabled:true,config:config()})},
  roomRocketSeason:{findFirst:async()=>state.season,findUnique:async()=>state.season,create:async({data})=>state.season=data},
  roomRocketProgress:{upsert:async({create})=>state.progress=({coins:0n,level:1,revision:0,dirty:true,...create}),findUniqueOrThrow:async()=>state.progress,findUnique:async({where})=>state.progress?.campaignId===where.campaignId_roomId.campaignId?state.progress:null,findFirst:async()=>state.progress,update:async({data})=>{const {revision,...rest}=data;Object.assign(state.progress,rest);if(revision)state.progress.revision+=revision.increment;return state.progress;}},
  roomRocketContribution:{upsert:async({where,create,update})=>{const k=key(where.campaignId_roomId_level_userId),old=state.contributions.get(k);if(old)old.coins+=update.coins.increment;else state.contributions.set(k,{...create});},findUnique:async({where})=>state.contributions.get(key(where.campaignId_roomId_level_userId)),update:async({where,data})=>Object.assign(state.contributions.get(key(where.campaignId_roomId_level_userId)),data)},
  roomRocketGift:{findUnique:async({where})=>state.gifts.get(where.giftId),create:async({data})=>state.gifts.set(data.giftId,data),update:async({where,data})=>Object.assign(state.gifts.get(where.giftId),data)},
  roomRocketLaunch:{create:async({data})=>{if([...state.launches.values()].some(l=>l.roomId===data.roomId&&l.level===data.level&&l.campaignId===data.campaignId))throw Error('duplicate launch');state.launches.set(data.id,{...data,paidUserIds:[]});},findUnique:async({where})=>[...state.launches.values()].find(l=>Object.entries(where.campaignId_roomId_level).every(([k,v])=>l[k]===v)),findUniqueOrThrow:async({where})=>state.launches.get(where.id),update:async({where,data})=>Object.assign(state.launches.get(where.id),data)},
  audioRoomMember:{findMany:async()=>['s','owner','r','hidden'].map(userId=>({userId}))},
  user:{findUniqueOrThrow:async({where})=>state.users.get(where.id),update:async({where,data})=>{state.users.get(where.id).coinBalance+=data.coinBalance.increment;}},
  walletTransaction:{create:async({data})=>state.ledger.push(data)},
  notification:{upsert:async({where,create})=>state.notifications.set(where.sourceKey,create)},
  $queryRaw:async(strings,...values)=>{if(strings.join('').includes('FROM "RoomRocketContribution"')) {const [roomId,campaignId,level]=values;return [...state.contributions.values()].filter(c=>c.roomId===roomId&&c.campaignId===campaignId&&c.level===level&&c.coins>0n).sort((a,b)=>a.coins===b.coins?a.userId.localeCompare(b.userId):a.coins>b.coins?-1:1).slice(0,strings.join('').includes('LIMIT 3') ? 3 : Infinity).map(c=>({...c,...state.users.get(c.userId)}));}return [];},
 };
 return {tx,state,gift:(id,coins,senderId='s')=>({id,coinValue:BigInt(coins),senderId,roomId:'ROOM-1',createdAt:now})};
}
afterEach(()=>{delete globalThis.portalIo;});
it('validates exact stages, integer precision and HTTPS artwork',()=>{
 const c=config();c.stages[0].targetCoins='9007199254740993';expect(validateRocketConfig(c).stages[0].targetCoins).toBe('9007199254740993');
 expect(()=>validateRocketConfig({...c,stages:[]})).toThrow();c.stages[0].thumbnailUrl='http://unsafe';expect(()=>validateRocketConfig(c)).toThrow();
});
it('publishes rule edits to the active season while keeping its targets and rewards',async()=>{
 const f=fixture(), draft=config();
 draft.enabled=false; draft.rules='Updated flight rules'; draft.stages[0].targetCoins='250';
 f.tx.roomRocketSettings.upsert=vi.fn();
 f.tx.roomRocketSeason.update=vi.fn();
 await saveRocketConfiguration(f.tx,draft,now);
 expect(f.tx.roomRocketSeason.update).toHaveBeenCalledWith({where:{id:'season'},data:{config:{...f.state.season.config,rules:draft.rules}}});
});
it('allocates overflow once and stays complete after the final stage',()=>{
 const r=allocateRocketCoins(config().stages,1,90n,700n);expect(r.allocations.map(a=>a.amount)).toEqual([10n,200n,300n]);expect(r.level).toBe(3);expect(r.currentCoins).toBe(300n);expect(allocateRocketCoins(config().stages,3,300n,10n).allocations).toEqual([]);
});
it('records distinct multi-recipient shares once, excludes backpack and reversed gifts, and preserves carryover',async()=>{
 const f=fixture();await recordRocketGift(f.tx,f.gift('a',60),'COINS',now);await recordRocketGift(f.tx,f.gift('a',60),'COINS',now);await recordRocketGift(f.tx,f.gift('b',60),'COINS',now);
 await recordRocketGift(f.tx,f.gift('bag',999),'BACKPACK',now);await recordRocketGift(f.tx,{...f.gift('refund',99),reversedAt:now},'COINS',now);
 expect(f.state.progress.coins).toBe(20n);expect(f.state.progress.level).toBe(2);expect(f.state.launches.size).toBe(1);expect(f.tx.events.filter(e=>e.event.endsWith(':launch'))).toHaveLength(1);
 const launchEvent=f.tx.events.find(e=>e.event==='audio-room:rocket:launch');
 expect(launchEvent.data.eventId).toBe(launchEvent.data.launchId);
 expect(f.state.launches.has(launchEvent.data.eventId)).toBe(true);
 await reverseRocketGift(f.tx,'b',now);await reverseRocketGift(f.tx,'b',now);expect(f.state.progress.coins).toBe(0n);expect(f.state.launches.size).toBe(1);
});
it('boards every contributing sender once and switches the roster when coins carry into the next level',async()=>{
 const f=fixture();
 for (const sender of ['s','owner','r','hidden','s']) await recordRocketGift(f.tx,f.gift('gift-'+f.state.gifts.size,1,sender),'COINS',now);
 const snapshot=await rocketSnapshot(f.tx,'ROOM-1',now);
 expect(snapshot.topContributors).toHaveLength(3);
 expect(snapshot.passengers.map(p=>p.publicId)).toEqual(['USR-s','USR-hidden','USR-owner','USR-r']);
 await recordRocketGift(f.tx,f.gift('overflow',96,'r'),'COINS',now);
 expect((await rocketSnapshot(f.tx,'ROOM-1',now)).passengers.map(p=>p.publicId)).toEqual(['USR-r']);
 await reverseRocketGift(f.tx,'overflow',now);
 expect((await rocketSnapshot(f.tx,'ROOM-1',now)).passengers).toEqual([]);
});
it('selects unique present in-room winners excluding top3 and invisible users',async()=>{
 const f=fixture();f.state.season.config.stages[0].inRoomWinners=10;f.state.season.config.stages[0].rewards.inRoom=[{type:'COINS',amount:'1',text:'1 Coin',rewardId:'in'}];
 globalThis.portalIo={in:()=>({fetchSockets:async()=>['s','owner','r','hidden'].map(internalUserId=>({data:{internalUserId,audioPresenceLeaseUntil:now.getTime()+10000}}))})};
 await recordRocketGift(f.tx,f.gift('a',100),'COINS',now);const winners=[...f.state.launches.values()][0].winners;
 expect(winners.filter(w=>w.group==='inRoom').map(w=>w.userId).sort()).toEqual(['owner','r']);expect(drawRocketWinners(['a','a','b'],['a'],10)).toEqual(['b']);
});
it('pays each winner once on repeated job execution and retains earned rewards',async()=>{
 const f=fixture();await recordRocketGift(f.tx,f.gift('a',100),'COINS',now);const launch=[...f.state.launches.values()][0];
 await payRocketLaunch(f.tx,launch.id,now);await payRocketLaunch(f.tx,launch.id,now);await reverseRocketGift(f.tx,'a',now);
 expect(f.state.users.get('s').coinBalance).toBe(5n);expect(f.state.ledger).toHaveLength(1);expect(f.state.notifications.size).toBe(1);expect(launch.paidAt).toEqual(now);
});
it('automatically rolls seasons forward without replaying gifts or decreasing revisions',async()=>{
 const f=fixture();await recordRocketGift(f.tx,f.gift('a',50),'COINS',now);const rev=f.state.progress.revision;const later=new Date('2026-12-05');
 const season=await currentRocketSeason(f.tx,later);expect(season.endsAt>later).toBe(true);const result=await rocketSnapshot(f.tx,'ROOM-1',later);
 expect(result.progress.currentCoins).toBe('0');expect(result.progress.revision).toBeGreaterThan(rev);expect(f.state.ledger).toHaveLength(0);
});
it('does not expose internal asset identifiers in reward DTOs',async()=>{
 const result=await displayRocketRewards({uploadAsset:{findUnique:async()=>({publicId:'AST-1'})}},[{type:'PROP',assetId:'AST-1',internalAssetId:'private',amount:'3'}],'https://test');expect(result[0].internalAssetId).toBeUndefined();expect(result[0].iconUrl).toBe('https://media.test/AST-1');
});
it('extends timed props, preserves permanent access and credits backpack once',async()=>{
 const f=fixture(); await recordRocketGift(f.tx,f.gift('a',100),'COINS',now);const launch=[...f.state.launches.values()][0];
 launch.winners[0].rewards=[{type:'PROP',internalAssetId:'timed',assetId:'AST-timed',amount:'3',text:'Frame'},{type:'PROP',internalAssetId:'permanent',assetId:'AST-permanent',amount:'3',text:'Permanent'},{type:'GIFT',internalAssetId:'bag',assetId:'AST-bag',amount:'4',text:'Gifts'}];
 const assignments=new Map([['timed',{expiresAt:new Date('2026-11-04T12:00:00Z')}],['permanent',{expiresAt:null}]]);let quantity=2;
 f.tx.uploadAssetAssignment={findUnique:async({where})=>assignments.get(where.assetId_userId.assetId),upsert:async({where,update})=>Object.assign(assignments.get(where.assetId_userId.assetId),update)};
 f.tx.userGiftInventory={upsert:async({update})=>{quantity+=update.quantity.increment;}};
 await payRocketLaunch(f.tx,launch.id,now);await payRocketLaunch(f.tx,launch.id,now);
 expect(assignments.get('timed').expiresAt.toISOString()).toBe('2026-11-07T12:00:00.000Z');expect(assignments.get('permanent').expiresAt).toBeNull();expect(quantity).toBe(6);
 expect(f.tx.events.filter(e=>e.event==='props:granted')).toHaveLength(1);expect(f.tx.events.filter(e=>e.event==='backpack:updated')).toHaveLength(1);
});
it('requires live membership and returns stable result pages with independent myRewards',async()=>{
 const f=fixture();f.tx.audioRoomMember.findUnique=async()=>({socketCount:0});
 await expect(requireRocketRoom(f.tx,'ROOM-1',{id:'s'})).rejects.toMatchObject({code:'JOIN_ROOM_FIRST'});
 f.tx.audioRoomMember.findUnique=async()=>({socketCount:1});
 const rewards=[{type:'COINS',amount:'5',text:'5 Coins'}];
 f.state.launches.set('L',{id:'L',campaignId:'season',roomId:'ROOM-1',level:1,winners:[{userId:'s',rank:1,rewards},{userId:'r',rank:2,rewards}],paidAt:now});
 f.tx.user.findMany=async({where})=>where.id.in.map(id=>f.state.users.get(id));
 const q=new URLSearchParams({campaignId:'season',stageId:'LV-1',limit:'1'});
 const first=await getRoomRocketResults('ROOM-1',{id:'r'},q,'https://test',f.tx);
 expect(first.recipients[0].user.publicId).toBe('USR-s');expect(first.myRewards).toHaveLength(1);expect(first.recipients[0].user.id).toBeUndefined();
 q.set('cursor',first.nextCursor);const second=await getRoomRocketResults('ROOM-1',{id:'r'},q,'https://test',f.tx);expect(second.recipients[0].user.publicId).toBe('USR-r');expect(second.nextCursor).toBeNull();
 q.set('cursor',Buffer.from(JSON.stringify({launchId:'other',offset:1})).toString('base64url'));
 await expect(getRoomRocketResults('ROOM-1',{id:'r'},q,'https://test',f.tx)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
});
it('applies the additive schema in isolated PostgreSQL and enforces launch and gift uniqueness',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE TYPE "WalletTransactionType" AS ENUM ('BONUS')`);
 await pg.exec(await readFile('prisma/migrations/20261104090000_room_rocket_wallet_type/migration.sql','utf8'));
 expect((await pg.query(`SELECT 'ROCKET_REWARD'::"WalletTransactionType" AS type`)).rows[0].type).toBe('ROCKET_REWARD');
 await pg.exec(await readFile('prisma/migrations/20261102200000_room_rocket/migration.sql','utf8'));
 await pg.exec(`INSERT INTO "RoomRocketProgress" ("roomId","campaignId",coins) VALUES ('room','old',77)`);
 await pg.exec(await readFile('prisma/migrations/20261104140000_deferred_rocket_gifts/migration.sql','utf8'));
 await pg.exec(`INSERT INTO "RoomRocketProgress" ("roomId","campaignId") VALUES ('room','new')`);
 expect((await pg.query(`SELECT coins::int FROM "RoomRocketProgress" WHERE "campaignId"='old'`)).rows[0].coins).toBe(77);
 await pg.exec(`INSERT INTO "RoomRocketLaunch" (id,"campaignId","roomId",level,winners) VALUES ('l','s','r',1,'[]')`);
 await expect(pg.exec(`INSERT INTO "RoomRocketLaunch" (id,"campaignId","roomId",level,winners) VALUES ('l2','s','r',1,'[]')`)).rejects.toThrow();
 await pg.exec(`BEGIN; INSERT INTO "RoomRocketGift" VALUES ('g','r','s','u','[]',null); ROLLBACK;`);
 expect((await pg.query('SELECT count(*) FROM "RoomRocketGift"')).rows[0].count).toBe(0);expect((await pg.query('SELECT count(*) FROM "RoomRocketSettings"')).rows[0].count).toBe(0);
 }finally{await pg.close();}
},20000);
