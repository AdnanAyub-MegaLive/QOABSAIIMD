import { prisma } from "./prisma.js";
import { requireTeamManager, subtree } from "./management-team.js";
import { normalizeSignupCountry } from "./geo-country.js";
import { salaryMonth, getAgencySalary } from "./agency-salary.js";
import { managementFailure } from "./management-web.js";
export async function businessScope(userId,db=prisma) {
  const me=await requireTeamManager(db,userId),country=normalizeSignupCountry(me.country);
  if(!country)throw managementFailure("Assign a country before managing agencies.");
  const members=(await subtree(db,me.id)).filter(u=>!u.deletedAt&&u.status==="ACTIVE"&&normalizeSignupCountry(u.country)===country);
  return {me,country,ids:[me.id,...members.map(u=>u.id)]};
}
export async function managementAgencies(userId,db=prisma) {
  const scope=await businessScope(userId,db);
  return db.agency.findMany({where:{country:scope.country,bdUserId:{in:scope.ids}},select:{publicId:true,name:true,status:true,country:true,bd:{select:{publicId:true,name:true}},owner:{select:{publicId:true,name:true}},_count:{select:{userHosts:true,talents:true}}},orderBy:{publicId:"asc"}});
}
export async function assignManagementAgency(userId,publicId,db=prisma) {
  if(typeof publicId!=="string"||!publicId.trim()||publicId.length>100)throw managementFailure("A valid agency public ID is required.",422);
  publicId=publicId.trim();
  return db.$transaction(async tx=>{
    const {me,country}=await businessScope(userId,tx);
    const agency=await tx.agency.findUnique({where:{publicId},include:{owner:true}});
    if(!agency||agency.country!==country||normalizeSignupCountry(agency.owner?.country)!==country||agency.status!=="ACTIVE")throw managementFailure("An active agency in your country is required.");
    if(agency.bdUserId&&agency.bdUserId!==me.id)throw managementFailure("This agency already has a supervisor. Only the Manager transfer workflow may move it.",409);
    await tx.agency.update({where:{id:agency.id},data:{bdUserId:me.id}});
    await tx.auditLog.create({data:{action:"MANAGEMENT_AGENCY_ASSIGNED",category:"AGENCY_MANAGEMENT",entityType:"Agency",entityId:publicId,description:`${me.publicId} assigned an unassigned agency to their supervision.`,metadata:{actorUserId:me.id,country}}});
    return {agencyId:publicId,supervisorId:me.publicId};
  },{isolationLevel:"Serializable"});
}
export async function managementPerformance(userId,month,agencyPublicId,db=prisma) {
  const scope=await businessScope(userId,db),period=salaryMonth(month);
  const agencies=await db.agency.findMany({where:{country:scope.country,bdUserId:{in:scope.ids}},select:{id:true,publicId:true,name:true,bdUserId:true,bd:{select:{publicId:true,name:true}},_count:{select:{userHosts:true,talents:true}}}});
  if(agencyPublicId){const agency=agencies.find(a=>a.publicId===agencyPublicId);if(!agency)throw managementFailure("Agency is outside your team.");return getAgencySalary(agency.id,period.month,db);}
  const totals=await db.giftSettlement.groupBy({by:["agencyId"],where:{agencyId:{in:agencies.map(a=>a.id)},createdAt:{gte:period.start,lt:period.end}},_sum:{grossCoins:true,hostSalaryCoins:true,agencyCoins:true}});
  const rows=agencies.map(a=>{const sum=totals.find(t=>t.agencyId===a.id)?._sum;return {publicId:a.publicId,name:a.name,supervisor:a.bd,hostCount:a._count.userHosts+a._count.talents,giftCoins:String(sum?.grossCoins??0n),salaryCoins:String(sum?.hostSalaryCoins??0n),commissionCoins:String(sum?.agencyCoins??0n)};});
  const rank=(a,b)=>BigInt(a.giftCoins)===BigInt(b.giftCoins)?a.publicId.localeCompare(b.publicId):BigInt(a.giftCoins)>BigInt(b.giftCoins)?-1:1;
  const groups=new Map();for(const row of rows){const id=row.supervisor.publicId,old=groups.get(id)??{publicId:id,name:row.supervisor.name,giftCoins:"0",agencies:0};old.giftCoins=String(BigInt(old.giftCoins)+BigInt(row.giftCoins));old.agencies++;groups.set(id,old);}
  return {month:period.month,timezone:"UTC",attribution:"CURRENT_AGENCY_SUPERVISION",agencyCount:rows.length,hostCount:rows.reduce((s,r)=>s+r.hostCount,0),giftCoins:rows.reduce((s,r)=>s+BigInt(r.giftCoins),0n).toString(),salaryCoins:rows.reduce((s,r)=>s+BigInt(r.salaryCoins),0n).toString(),agencies:rows.sort(rank),topAgencies:[...rows].sort(rank).slice(0,3),topSupervisors:[...groups.values()].sort(rank).slice(0,3)};
}
