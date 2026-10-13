import { describe,it,expect } from "vitest";
import { agencyWork, hierarchyWork, validateSalaryTiers, talentCommission, usdValue } from "./agency-work.js";
const policy={version:1,tiers:[{minDiamonds:"1000000",commissionBps:200}],diamondsPerUsd:90000n};
const gift=(who,diamonds)=>({recipientDiamonds:diamonds,giftTransaction:{recipientUserId:who,talentId:null}});
describe("Agency Diamond salaries",()=>{
 it("pays 2% for each of ten million-Diamond talents",()=>{
   const work=agencyWork(Array.from({length:10},(_,i)=>gift(String(i),1000000n)),policy);
   expect(work.totalDiamonds).toBe("10000000");expect(work.salaryDiamonds).toBe("200000");expect(work.qualifiedTalents).toBe(10);expect(work.salaryUsd).toBe("2.22");
 });
 it("aggregates gifts per talent before checking a target and includes nonqualifiers in work",()=>{
   const work=agencyWork([gift("a",400000n),gift("a",600000n),gift("b",999999n)],policy);
   expect(work.totalDiamonds).toBe("1999999");expect(work.salaryDiamonds).toBe("20000");expect(work.qualifiedTalents).toBe(1);
 });
 it("uses only the highest achieved tier on the talent's full amount",()=>{
   expect(talentCommission(2000000n,[...policy.tiers,{minDiamonds:"2000000",commissionBps:300}]).salaryDiamonds).toBe("60000");
   expect(talentCommission(999999n,policy.tiers).salaryDiamonds).toBe("0");
 });
 it("does not invent Diamond valuations or enabled salary policies",()=>{
   expect(agencyWork([gift("a",null),gift("a",1000000n)],null)).toMatchObject({totalDiamonds:"1000000",salaryDiamonds:"0",unvaluedGiftCount:1,policyConfigured:false});
 });
 it("uses exact integer math with fractional percentages and rounds down",()=>{
   expect(talentCommission(1000001n,[{minDiamonds:"1",commissionBps:125}]).salaryDiamonds).toBe("12500");
   expect(usdValue(90000n)).toBe("1.00");
 });
 it("rejects duplicate targets, negative amounts and excessive percentages",()=>{
   for(const rows of [[],[{minDiamonds:"-1",commissionBps:200}],[{minDiamonds:"1",commissionBps:10001}],[{minDiamonds:"1",commissionBps:1},{minDiamonds:"01",commissionBps:2}]])expect(()=>validateSalaryTiers(rows)).toThrow();
 });
 it("rolls every agency through all ancestors once without mixing sibling branches",()=>{
   const roles=["BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD"];
   const people=roles.map((role,i)=>({id:String(i),publicId:role,name:role,teamRole:role,supervisorUserId:i<5?String(i+1):null}));
   people.push({id:"other",publicId:"OTHER_BD",name:"Other",teamRole:"BD",supervisorUserId:"1"});
   const result=hierarchyWork(people,[{bdUserId:"0",work:{totalDiamonds:"10000000",salaryDiamonds:"200000"}},{bdUserId:"other",work:{totalDiamonds:"2000000",salaryDiamonds:"40000"}}]);
   expect(result.find(r=>r.publicId==="BD").totalDiamonds).toBe("10000000");
   for(const role of roles.slice(1))expect(result.find(r=>r.publicId===role)).toMatchObject({totalDiamonds:"12000000",salaryDiamonds:"240000",agencyCount:2});
 });
 it("terminates a malformed cycle and counts each agency only once per member",()=>{
   const rows=hierarchyWork([{id:"a",publicId:"A",supervisorUserId:"b"},{id:"b",publicId:"B",supervisorUserId:"a"}],[{bdUserId:"a",work:{totalDiamonds:"10",salaryDiamonds:"1"}}]);
   expect(rows.map(r=>r.totalDiamonds)).toEqual(["10","10"]);
 });
});
