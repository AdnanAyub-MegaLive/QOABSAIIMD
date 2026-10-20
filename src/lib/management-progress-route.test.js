import { beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),transaction:vi.fn(),report:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{$transaction:m.transaction}}));
vi.mock("@/lib/portal-admin",()=>({requirePermission:m.permission}));
vi.mock("@/lib/management-progress-report",async()=>({...await import("./management-progress-report.js"),managementProgressReport:m.report}));
import { GET } from "../app/api/admin/management-progress/route.js";
beforeEach(()=>{
  vi.clearAllMocks();m.permission.mockResolvedValue({});
  m.transaction.mockImplementation(fn=>fn({}));
  m.report.mockResolvedValue({from:"2026-10-01",to:"2026-10-10",rows:[]});
});
it("blocks unauthorized report and exports before database access",async()=>{
  m.permission.mockRejectedValue(Object.assign(Error("Forbidden"),{status:403}));
  const response=await GET(new Request("https://portal.test/api/admin/management-progress?format=csv"));
  expect(response.status).toBe(403);expect(m.transaction).not.toHaveBeenCalled();
});
it("returns CSV with no-store and report JSON with the same validated selection",async()=>{
  for(const format of ["","csv"]){
    const response=await GET(new Request(`https://portal.test/api/admin/management-progress?from=2026-10-01&to=2026-10-10&role=BD&format=${format}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    if(format)expect(response.headers.get("Content-Disposition")).toContain(".csv");
    else expect((await response.json()).data.rows).toEqual([]);
  }
  expect(m.permission).toHaveBeenCalledWith("rules.hierarchy");
  expect(m.report.mock.calls[0][1]).toMatchObject({role:"BD",from:"2026-10-01",to:"2026-10-10"});
});
