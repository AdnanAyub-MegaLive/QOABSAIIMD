import { expect, it, vi } from "vitest";
import { activitySnapshot, awardActivityXp, validateActivityRule, activityProgress } from "./activity-levels.js";
const rule = { track: "AGENCY", enabled: true, rateBps: 1000, revision: 2, levels: [{level:0,threshold:"0"},{level:1,threshold:"100"},{level:2,threshold:"1000"}] };
it("validates ordered thresholds and percentage bounds", () => {
  expect(validateActivityRule(rule).rateBps).toBe(1000);
  expect(() => validateActivityRule({...rule,rateBps:10001})).toThrow();
  expect(() => validateActivityRule({...rule,levels:[{level:0,threshold:"0"},{level:1,threshold:"0"}]})).toThrow();
});
it("calculates threshold boundaries and maximum level", () => {
  expect(activitySnapshot(rule,99n).level).toBe(0);
  expect(activitySnapshot(rule,100n).level).toBe(1);
  expect(activitySnapshot(rule,1000n)).toMatchObject({level:2,nextLevel:null,remainingXp:"0",progressPercent:100});
});
it("awards ten percent of settled Diamonds using integer arithmetic and source deduplication", async () => {
  const entries=new Map();
  const emit=vi.fn();
  const tx={levelTagBackground:{findMany:async()=>[]},realtimeOutbox:{create:emit},agency:{findUnique:async()=>({publicId:"AGN-1",owner:{publicId:"USR-1"}})},activityLevelRule:{findUnique:async()=>rule},activityLevelAward:{createMany:async({data:[create]})=>{const key=create.sourceId;if(entries.has(key))return {count:0};entries.set(key,create);return {count:1};},count:async()=>entries.size,aggregate:async()=>({_sum:{xp:[...entries.values()].reduce((n,r)=>n+r.xp,0n)}})}};
  await awardActivityXp(tx,"AGENCY","agency","gift",100000000n);
  await awardActivityXp(tx,"AGENCY","agency","gift",100000000n);
  expect([...entries.values()]).toEqual([expect.objectContaining({xp:10000000n,amount:100000000n,ruleRevision:2,subjectId:"agency"})]);
  expect(emit).toHaveBeenCalledTimes(1);
  expect(emit.mock.calls[0][0].data).toMatchObject({channel:"user:USR-1",event:"activity-progression:updated",payload:{data:{track:"AGENCY",revision:1,lifetimeXp:"10000000"}}});
});
it("does not award when unconfigured or disabled", async()=>{
 const upsert=vi.fn(),tx={activityLevelRule:{findUnique:async()=>null},activityLevelAward:{upsert}};
 await awardActivityXp(tx,"GAME","user","round",100n);
 tx.activityLevelRule.findUnique=async()=>({...rule,enabled:false});
 await awardActivityXp(tx,"GAME","user","round",100n);
 expect(upsert).not.toHaveBeenCalled();
});
it("rejects missing subjects instead of returning platform-wide totals",async()=>{
 await expect(activityProgress("AGENCY",undefined)).rejects.toThrow("subject ID");
});
