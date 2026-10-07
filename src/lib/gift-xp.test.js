import { expect, it } from "vitest";
import { awardGiftProgress } from "./progression.js";
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
it("does not give Charm to ordinary recipients or self-gifts",async()=>{
 const db=database();await awardGiftProgress(db,{...input,recipientType:"NORMAL_USER"});expect(db.ledger).toHaveLength(1);expect(db.ledger[0].track).toBe("USER");
 const self=database();await awardGiftProgress(self,{...input,recipient:input.sender});expect(self.ledger).toHaveLength(0);
});
it.each(["BACKPACK","LUCKY","BLIND_BOX"])("uses configured gift XP for %s",async source=>{const db=database();await awardGiftProgress(db,{...input,source});expect(db.ledger.map(r=>r.deltaPoints)).toEqual([200000n,100000n]);});
