import { MANAGEMENT_ROLE_ORDER, managementRole } from "./user-roles.js";
import { targetReports } from "./management-target-report.js";

export function reportSelection(params) {
  const parse = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) throw new Error("Choose valid start and end dates.");
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new Error("Choose valid dates.");
    return date;
  };
  const from = params.get("from"), to = params.get("to");
  const start = parse(from), end = new Date(parse(to).getTime() + 86400000);
  if (end <= start || end - start > 366 * 86400000) throw new Error("Choose an ordered date range of at most 366 days.");
  const role = params.get("role") || "";
  if (role && !MANAGEMENT_ROLE_ORDER.includes(role)) throw new Error("Choose a valid management role.");
  return { from, to, start, end, role };
}

export async function managementProgressReport(db, selection) {
  const people = (await db.user.findMany({
    where: { deletedAt: null, OR: [{ appRoles: { hasSome: MANAGEMENT_ROLE_ORDER } }, { teamRole: { in: MANAGEMENT_ROLE_ORDER } }] },
    select: { id:true, publicId:true, name:true, country:true, status:true, appRoles:true, teamRole:true },
    orderBy: [{ name:"asc" }, { publicId:"asc" }],
  })).map(p => ({...p, role:p.teamRole ?? managementRole(p)})).filter(p => !selection.role || p.role === selection.role);
  const agencies = await db.agency.findMany({ where:{bdUserId:{in:people.map(p=>p.id)}}, select:{id:true,bdUserId:true} });
  const where = { agencyId:{in:agencies.map(a=>a.id)}, giftTransaction:{reversedAt:null}, createdAt:{gte:selection.start,lt:selection.end} };
  const sums = await db.giftSettlement.groupBy({by:["agencyId"],where,_sum:{recipientDiamonds:true}});
  const missing = await db.giftSettlement.groupBy({by:["agencyId"],where:{...where,recipientDiamonds:null},_count:{_all:true}});
  const sumMap = new Map(sums.map(r=>[r.agencyId,r._sum.recipientDiamonds??0n]));
  const missingMap = new Map(missing.map(r=>[r.agencyId,r._count._all]));
  const policy = await db.teamPolicy.findUnique({where:{id:"GLOBAL"}});
  const targets = targetReports(people, agencies.map(a=>({...a,work:{totalDiamonds:String(sumMap.get(a.id)??0n),unvaluedGiftCount:missingMap.get(a.id)??0}})),policy?.topUpTargets??[]);
  return { from:selection.from,to:selection.to,timezone:"UTC",generatedAt:new Date().toISOString(),
    targetBasis:"CURRENT_MONTHLY_TARGET_NOT_PRORATED",attribution:"CURRENT_DIRECT_AGENCY_SUPERVISION",
    rows:people.map(p=>({publicId:p.publicId,name:p.name,role:p.role,country:p.country,status:p.status,...targets.get(p.publicId)})) };
}

export function progressCsv(report) {
  // Neutralize spreadsheet formulas in all exported text.
  const cell = value => `"${String(value??"").replace(/^[\s]*[=+\-@\t\r]/,m=>"'"+m).replaceAll('"','""')}"`;
  const headers = ["From (UTC)","Through (UTC)","ID","Name","Role","Country","Account status","Direct agencies","Received Diamonds","Configured monthly target Diamonds (not prorated)","Progress %","Remaining Diamonds","Status","Unvalued gifts","Attribution","Generated at"];
  return "\uFEFF"+[headers,...report.rows.map(r=>[report.from,report.to,r.publicId,r.name,r.role,r.country,r.status,r.agencyCount,r.progressDiamonds,r.targetDiamonds,r.progressPercent,r.remainingDiamonds,r.unvaluedGiftCount?"Incomplete valuation":!r.configured?"Not configured":r.achieved?"Achieved":"In progress",r.unvaluedGiftCount,report.attribution,report.generatedAt])].map(row=>row.map(cell).join(",")).join("\r\n");
}
