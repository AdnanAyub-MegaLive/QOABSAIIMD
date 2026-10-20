import { expect,it,vi } from "vitest";
import { reportSelection,managementProgressReport,progressCsv } from "./management-progress-report.js";
it("validates dates, roles, inclusive UTC end and bounded ranges",()=>{
  const s=reportSelection(new URLSearchParams({from:"2026-10-01",to:"2026-10-10",role:"BD"}));
  expect(s.end.toISOString()).toBe("2026-10-11T00:00:00.000Z");
  for(const [from,to,role] of [["2026-02-30","2026-03-01",""],["2026-10-11","2026-10-10",""],["2024-01-01","2026-01-01",""],["2026-01-01","2026-01-02","bogus"]]){
    expect(()=>reportSelection(new URLSearchParams({from,to,role}))).toThrow();
  }
});
it("reports only selected role/direct agencies using recorded Diamonds and flags incomplete valuation",async()=>{
  const db={
    user:{findMany:async()=>[{id:"b",publicId:"USR-B",name:"BD",appRoles:["BD"]},{id:"j",publicId:"USR-J",appRoles:["JUNIOR_ADMIN"]}]},
    agency:{findMany:vi.fn(async()=>[{id:"a",bdUserId:"b"}])},
    giftSettlement:{groupBy:vi.fn(async({where})=>where.recipientDiamonds===null?[{agencyId:"a",_count:{_all:1}}]:[{agencyId:"a",_sum:{recipientDiamonds:100000000n}}])},
    teamPolicy:{findUnique:async()=>({topUpTargets:[{role:"BD",targetDiamonds:"100000000",salaryAmount:"100",salaryCurrency:"USD"}]})},
  };
  const selection=reportSelection(new URLSearchParams({from:"2026-10-01",to:"2026-10-10",role:"BD"}));
  const result=await managementProgressReport(db,selection);
  expect(db.agency.findMany.mock.calls[0][0].where.bdUserId.in).toEqual(["b"]);
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({progressDiamonds:"100000000",targetDiamonds:"100000000",progressPercent:100,achieved:false,unvaluedGiftCount:1});
  expect(db.giftSettlement.groupBy.mock.calls[0][0].where).toMatchObject({giftTransaction:{reversedAt:null},createdAt:{gte:selection.start,lt:selection.end}});
  result.rows[0].name='=HYPERLINK("bad")';
  const csv=progressCsv(result);
  expect(csv).toContain(`"'=HYPERLINK(""bad"")"`);
  expect(csv).toContain("Incomplete valuation");
  expect(csv).toContain("100000000");
});
