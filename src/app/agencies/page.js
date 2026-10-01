import { requirePagePermission } from "@/lib/portal-admin";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import FeatureSearch from "../components/feature-search";
import AgencyTabs from "./agency-tabs";
import PortalSidebar from "../components/portal-sidebar";
import { prisma } from "../../lib/prisma";

export default async function AgenciesPage() {
  await requirePagePermission("agencies.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  const monthStart=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),1));
  const [records, joinRecords, agencyRecords, settlementTotals, rechargeTotals, userHosts, talentHosts, userGiftTotals]=await Promise.all([prisma.agencyApplication.findMany({
    select:{
      publicId:true,
      agencyName:true,
      email:true,
      whatsapp:true,
      bdCode:true,
      country:true,
      status:true,
      createdAt:true,
      updatedAt:true,
      reviewedAt:true,
      cnicFrontMime:true,
      cnicBackMime:true,
      reviewNote:true,
      rejectionReason:true,
      reviewedBy:{select:{name:true,email:true}},
      user:{select:{publicId:true,name:true,phone:true,profileImage:true}},
    },
    orderBy:{createdAt:"desc"},
    take:500,
  }),prisma.agencyJoinRequest.findMany({select:{publicId:true,status:true,createdAt:true,updatedAt:true,reviewedAt:true,reviewNote:true,reviewedBy:{select:{name:true,email:true}},user:{select:{publicId:true,name:true,phone:true,profileImage:true}},agency:{select:{publicId:true,name:true,status:true}}},orderBy:{createdAt:"desc"},take:500}),prisma.agency.findMany({select:{id:true,publicId:true,name:true,status:true,monthlyTargetCoins:true,commissionCoinBalance:true,createdAt:true,_count:{select:{userHosts:true,talents:true}}},orderBy:{createdAt:"desc"}}),prisma.giftSettlement.groupBy({by:["agencyId"],where:{agencyId:{not:null},createdAt:{gte:monthStart}},_sum:{grossCoins:true,hostSalaryCoins:true,agencyCoins:true}}),prisma.user.groupBy({by:["agencyId"],where:{agencyId:{not:null},deletedAt:null},_sum:{totalTopUp:true}}),prisma.user.findMany({where:{agencyId:{not:null},deletedAt:null},select:{id:true,publicId:true,name:true,agencyId:true,hostSalaryCoinBalance:true,totalTopUp:true,agency:{select:{name:true,publicId:true}}},orderBy:{hostSalaryCoinBalance:"desc"}}),prisma.talent.findMany({select:{publicId:true,displayName:true,agencyId:true,hostSalaryCoinBalance:true,totalGiftsValue:true,agency:{select:{name:true,publicId:true}}},orderBy:{hostSalaryCoinBalance:"desc"}}),prisma.giftTransaction.groupBy({by:["recipientUserId"],where:{recipientUserId:{not:null}},_sum:{coinValue:true}})]);
  const applications=records.map((application)=>({
    id:application.publicId,
    agencyName:application.agencyName,
    email:application.email,
    whatsapp:application.whatsapp,
    bdCode:application.bdCode,
    country:application.country,
    status:application.status,
    submittedAt:application.createdAt.toISOString(),
    updatedAt:application.updatedAt.toISOString(),
    reviewedAt:application.reviewedAt?.toISOString()??null,
    reviewNote:application.reviewNote,
    rejectionReason:application.rejectionReason,
    reviewedBy:application.reviewedBy?{name:application.reviewedBy.name,email:application.reviewedBy.email}:null,
    applicant:{
      id:application.user.publicId,
      name:application.user.name,
      phone:application.user.phone,
      profileImage:application.user.profileImage,
    },
    cnicFrontUrl:application.cnicFrontMime?`/api/agencies/applications/${application.publicId}/cnic/front`:null,
    cnicBackUrl:application.cnicBackMime?`/api/agencies/applications/${application.publicId}/cnic/back`:null,
  }));
  const joinRequests=joinRecords.map((request)=>({id:request.publicId,status:request.status,submittedAt:request.createdAt.toISOString(),updatedAt:request.updatedAt.toISOString(),reviewedAt:request.reviewedAt?.toISOString()??null,reviewNote:request.reviewNote,reviewedBy:request.reviewedBy,applicant:{id:request.user.publicId,name:request.user.name,phone:request.user.phone,profileImage:request.user.profileImage},agency:{id:request.agency.publicId,name:request.agency.name,status:request.agency.status}}));
  const settlementsByAgency=new Map(settlementTotals.map((item)=>[item.agencyId,item._sum]));
  const rechargeByAgency=new Map(rechargeTotals.map((item)=>[item.agencyId,item._sum.totalTopUp??0n]));
  const rankings=agencyRecords.map((agency)=>{const gifts=settlementsByAgency.get(agency.id)?.grossCoins??0n;const target=agency.monthlyTargetCoins;const progress=target>0n?Number((gifts*10000n)/target)/100:0;return{id:agency.publicId,name:agency.name,status:agency.status,hosts:agency._count.userHosts+agency._count.talents,gifts:gifts.toString(),target:target.toString(),progress};}).sort((left,right)=>BigInt(right.gifts)>BigInt(left.gifts)?1:BigInt(right.gifts)<BigInt(left.gifts)?-1:0).map((agency,index)=>({...agency,rank:index+1}));
  const giftsByUser=new Map(userGiftTotals.map((item)=>[item.recipientUserId,item._sum.coinValue??0n]));
  const topHosts=[...userHosts.map((host)=>({id:host.publicId,name:host.name,agency:host.agency.name,agencyId:host.agency.publicId,salary:host.hostSalaryCoinBalance.toString(),gifts:(giftsByUser.get(host.id)??0n).toString(),kind:"User Host"})),...talentHosts.map((host)=>({id:host.publicId,name:host.displayName,agency:host.agency.name,agencyId:host.agency.publicId,salary:host.hostSalaryCoinBalance.toString(),gifts:host.totalGiftsValue.toString(),kind:"Talent Host"}))].sort((left,right)=>BigInt(right.gifts)>BigInt(left.gifts)?1:BigInt(right.gifts)<BigInt(left.gifts)?-1:0).slice(0,10).map((host,index)=>({...host,rank:index+1}));
  const agencyModules={tasks:rankings.map((agency)=>({agencyId:agency.id,agency:agency.name,target:agency.target,achieved:agency.gifts,progress:`${agency.progress.toFixed(1)}%`,status:agency.target==="0"?"Not set":agency.progress>=100?"Achieved":"In progress"})),monthlySalaries:agencyRecords.map((agency)=>({agencyId:agency.publicId,agency:agency.name,hostSalary:(settlementsByAgency.get(agency.id)?.hostSalaryCoins??0n).toString(),agencyCommission:(settlementsByAgency.get(agency.id)?.agencyCoins??0n).toString(),status:agency.status})),hostSalaries:[...userHosts.map((host)=>({hostId:host.publicId,host:host.name,agency:host.agency.name,type:"User Host",salaryBalance:host.hostSalaryCoinBalance.toString()})),...talentHosts.map((host)=>({hostId:host.publicId,host:host.displayName,agency:host.agency.name,type:"Talent Host",salaryBalance:host.hostSalaryCoinBalance.toString()}))]};
  const overview={rankings,topHosts,totalAgencies:agencyRecords.length,activeAgencies:agencyRecords.filter((agency)=>agency.status==="ACTIVE").length,totalHosts:userHosts.length+talentHosts.length,totalRecharge:[...rechargeByAgency.values()].reduce((sum,value)=>sum+value,0n).toString(),monthlyGifts:settlementTotals.reduce((sum,item)=>sum+(item._sum.grossCoins??0n),0n).toString(),pendingApplications:applications.filter((item)=>item.status==="PENDING").length,pendingJoinRequests:joinRequests.filter((item)=>item.status==="PENDING").length};

  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section className="lg:pl-64">
        <header className="flex h-20 items-center gap-6 border-b border-[#dfe9e7] bg-white px-6 md:px-10">
          <div className="shrink-0">
            <p className="text-xs font-semibold tracking-widest text-[#16877d] uppercase">
              Management
            </p>
            <h1 className="text-xl font-bold">Agencies</h1>
          </div>
          <FeatureSearch />
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{session.user.name}</p>
              <p className="text-xs text-[#718580]">{session.user.email}</p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="rounded-lg border border-[#d7e4e1] px-4 py-2 text-xs font-semibold text-[#526b67] hover:bg-[#f1f7f5]">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7">
            <h2 className="text-2xl font-bold">Agency management</h2>
            <p className="mt-1.5 text-sm text-[#71847f]">
              Monitor agency rankings, host targets, tasks, applications, and
              salary activity.
            </p>
          </div>
          <AgencyTabs applications={applications} joinRequests={joinRequests} overview={overview} modules={agencyModules}/>
        </div>
      </section>
    </main>
  );
}
