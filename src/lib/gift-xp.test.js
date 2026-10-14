import { expect, it, vi } from "vitest";
import { awardGiftProgress, resolveGiftProgressRecipient } from "./progression.js";
function database() {
  const rows=new Map(),ledger=[];
  const levels=["USER","CHARM"].flatMap(track=>Array.from({length:11},(_,level)=>({track,level,thresholdPoints:BigInt(level*900),benefits:[]})));
  const config={version:1,enabled:true,levels,rules:["USER","CHARM"].flatMap(track=>["PAID","BACKPACK","LUCKY","BLIND_BOX"].map(source=>({track,source,recipientType:track==="USER"?"ANY":"HOST",basis:"GIFT_XP",allowSelf:false,numerator:"1",denominator:"1"})))};
  return {rows,ledger,progressionConfiguration:{findFirst:async()=>config},uploadAsset:{findUnique:async()=>({senderXp:100000n,receiverXp:50000n})},
    userProgress:{findUnique:async({where})=>rows.get(JSON.stringify(where.userId_track))??null,create:async({data})=>{const row={...data,lifetimePoints:0n,currentLevel:0,revision:0,configuration:config};rows.set(JSON.stringify({userId:data.userId,track:data.track}),row);return row;},update:async({where,data})=>{const row=rows.get(JSON.stringify(where.userId_track));Object.assign(row,{...data,revision:row.revision+1});return row;}},
    progressLedger:{findUnique:async({where})=>ledger.find(r=>Object.entries(where.userId_track_sourceType_sourceId_sourceLineId).every(([k,v])=>r[k]===v)),create:async({data})=>{ledger.push(data);}},realtimeOutbox:{create:async()=>({id:"event"})}};
}
const gift={id:"gift-1",giftAssetId:"asset-1",quantity:2};
const input={sender:{id:"sender",publicId:"USR-S"},recipient:{id:"host",publicId:"TLN-H"},gift,source:"PAID",gross:1n,credit:1n,recipientType:"HOST"};
it("awards per-gift XP times quantity independently of price and deduplicates",async()=>{
 const db=database(); await awardGiftProgress(db,input); await awardGiftProgress(db,input);
 expect(db.ledger.map(r=>r.deltaPoints)).toEqual([200000n,100000n]);
 expect(db.ledger.every(r=>r.basis==="GIFT_XP")).toBe(true);
 expect([...db.rows.values()].every(r=>r.currentLevel===10)).toBe(true);
});
it("awards Wealth only to the sender and Charm only to the recipient",async()=>{
 const db=database();await awardGiftProgress(db,input);
 expect(db.ledger.map(r=>({userId:r.userId,track:r.track,sourceType:r.sourceType}))).toEqual([
  {userId:"sender",track:"USER",sourceType:"GIFT_SENT"},
  {userId:"host",track:"CHARM",sourceType:"GIFT_RECEIVED"},
 ]);
});
it.each(["RECHARGE","TRANSFER","STORE_PURCHASE","DAILY_TASK","LOGIN"])("does not award either track for %s",async source=>{
 const db=database();await awardGiftProgress(db,{...input,source});expect(db.ledger).toHaveLength(0);expect(db.rows.size).toBe(0);
});
it("does not give Charm without a matching rule or when self-gifts are excluded",async()=>{
 const db=database();await awardGiftProgress(db,{...input,recipientType:"NORMAL_USER"});expect(db.ledger).toHaveLength(1);expect(db.ledger[0].track).toBe("USER");
 const self=database();await awardGiftProgress(self,{...input,recipient:input.sender});expect(self.ledger).toHaveLength(0);
});
it("resolves Talent to its exact user and awards receiver XP once with notification",async()=>{
 const db=database();db.talent={findUnique:vi.fn().mockResolvedValue({publicId:"TLN-H"})};db.user={findFirst:vi.fn().mockResolvedValue(input.recipient)};
 db.realtimeOutbox.create=vi.fn().mockResolvedValue({id:"event"});
 const args={...input,recipient:null,gift:{...gift,talentId:"talent"}};
 await awardGiftProgress(db,args);await awardGiftProgress(db,args);
 expect(db.ledger.filter(r=>r.track==="CHARM").map(r=>r.deltaPoints)).toEqual([100000n]);
 expect(db.realtimeOutbox.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({channel:"user:TLN-H",event:"progression:updated",payload:expect.objectContaining({data:expect.objectContaining({track:"CHARM",level:10})})})}));
});
it("awards normal-user Charm when the configuration includes its rule",async()=>{
 const db=database(),config=await db.progressionConfiguration.findFirst();
 config.rules.push({...config.rules.find(r=>r.track==="CHARM"&&r.source==="PAID"),recipientType:"NORMAL_USER"});
 await awardGiftProgress(db,{...input,recipientType:"NORMAL_USER"});
 expect(db.ledger.map(r=>r.deltaPoints)).toEqual([200000n,100000n]);
});
it("does not guess an account for an unmapped Talent",async()=>{
 const db={talent:{findUnique:vi.fn().mockResolvedValue({publicId:"TLN-X"})},user:{findFirst:vi.fn().mockResolvedValue(null)}};
 expect(await resolveGiftProgressRecipient(db,{talentId:"t"},null)).toBeNull();
 expect(db.user.findFirst).toHaveBeenCalledWith({where:{publicId:"TLN-X",deletedAt:null},select:{id:true,publicId:true}});
});
it("does not award receiver XP when configured gift receiver XP is zero",async()=>{
 const db=database();db.uploadAsset.findUnique=async()=>({senderXp:100n,receiverXp:0n});
 await awardGiftProgress(db,input);
 expect(db.ledger.map(r=>r.track)).toEqual(["USER"]);
});
it("applies self-gift eligibility after Talent account resolution",async()=>{
 const db=database();db.talent={findUnique:async()=>({publicId:input.sender.publicId})};db.user={findFirst:async()=>input.sender};
 await awardGiftProgress(db,{...input,recipient:null,gift:{...gift,talentId:"self-talent"}});
 expect(db.ledger).toHaveLength(0);
});
it.each(["BACKPACK","LUCKY","BLIND_BOX"])("uses configured gift XP for %s",async source=>{const db=database();await awardGiftProgress(db,{...input,source});expect(db.ledger.map(r=>r.deltaPoints)).toEqual([200000n,100000n]);});
