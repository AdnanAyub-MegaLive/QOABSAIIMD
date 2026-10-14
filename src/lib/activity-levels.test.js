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
  const tx={activityLevelRule:{findUnique:async()=>rule},activityLevelAward:{upsert:async({where,create})=>{const key=JSON.stringify(where);if(!entries.has(key))entries.set(key,create);}}};
  await awardActivityXp(tx,"AGENCY","agency","gift",100000000n);
  await awardActivityXp(tx,"AGENCY","agency","gift",100000000n);
  expect([...entries.values()]).toEqual([expect.objectContaining({xp:10000000n,amount:100000000n,ruleRevision:2,subjectId:"agency"})]);
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
