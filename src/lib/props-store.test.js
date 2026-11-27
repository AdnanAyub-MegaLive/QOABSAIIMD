import { expect, it, vi } from "vitest";
vi.mock("./prisma.js",()=>({prisma:{}}));
vi.mock("./reseller-props.js",()=>({syncResellerProps:vi.fn()}));
import { syncProgressionProps, storeAssetPayload } from "./props-store.js";

function database(level,existing=[]) {
 const assets=[{id:"tag",distribution:"VIP",minimumVipLevel:1,defaultGrantDurationMinutes:null},{id:"frame5",distribution:"VIP",minimumVipLevel:5,defaultGrantDurationMinutes:null}];
 return {
  user:{findUnique:vi.fn(async()=>({id:"u",vipLevel:level,totalTopUp:0n}))},
  uploadAsset:{findMany:vi.fn(async({where})=>assets.filter(a=>a.minimumVipLevel===where.OR[0].minimumVipLevel))},
  uploadAssetAssignment:{deleteMany:vi.fn(),findMany:vi.fn(async()=>existing),upsert:vi.fn(),update:vi.fn()},
 };
}
it("grants VIP 1 level rewards using the selected numeric level",async()=>{
 const db=database(1);
 await syncProgressionProps("u",db);
 expect(db.uploadAssetAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({assetId:"tag",userId:"u",source:"VIP",sourceReference:"VIP_LEVEL_1"})}));
});
it.each([0,1])("removes VIP-derived rewards of every other level than %s, including when nothing qualifies",async level=>{
 const db=database(level);
 await syncProgressionProps("u",db);
 expect(db.uploadAssetAssignment.deleteMany).toHaveBeenCalledWith({where:{userId:"u",source:"VIP",asset:{distribution:"VIP",minimumVipLevel:{not:level}}}});
 if(!level)expect(db.uploadAssetAssignment.upsert).not.toHaveBeenCalled();
});
it("does not overwrite existing valid independent entitlements or extend them on reads",async()=>{
 const db=database(1,[{assetId:"tag",expiresAt:null,source:"MANUAL"}]);
 await syncProgressionProps("u",db);
 expect(db.uploadAssetAssignment.upsert).not.toHaveBeenCalled();
 expect(db.uploadAssetAssignment.update).not.toHaveBeenCalled();
});
it("keeps a non-VIP reward locked in the Store",()=>{
 const result=storeAssetPayload({publicId:"AST-tag",distribution:"VIP",minimumVipLevel:1},{coinBalance:0n},null,null);
 expect(result).toMatchObject({owned:false,canPurchase:false,lockedReason:"Requires VIP 1"});
});
it("VIP 5 receives only VIP 5 rewards, not lower-level ones",async()=>{
 const db=database(5);
 await syncProgressionProps("u",db);
 expect(db.uploadAssetAssignment.upsert).toHaveBeenCalledTimes(1);
 expect(db.uploadAssetAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({assetId:"frame5",sourceReference:"VIP_LEVEL_5"})}));
 expect(db.uploadAssetAssignment.deleteMany).toHaveBeenCalledWith({where:{userId:"u",source:"VIP",asset:{distribution:"VIP",minimumVipLevel:{not:5}}}});
});
