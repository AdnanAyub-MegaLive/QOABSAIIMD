import { calendarWindow } from '@/lib/business-time.js';
import DirectoryExport from '../components/directory-export';
import CreateAgency from "./create-agency";
import { hasPermission } from "@/lib/portal-permissions";
import { requirePagePermission } from "@/lib/portal-admin";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../../auth";
import FeatureSearch from "../components/feature-search";
import AgencyTabs from "./agency-tabs";
import PortalSidebar from "../components/portal-sidebar";
import { prisma } from "../../lib/prisma";
import { readPaging, splitPage } from "@/lib/portal-paging";

const TABS=["Agency Home","Work & Targets","Agency Tasks","Monthly Salary","Host Salaries","Agency Apply","Join Requests"];
const STATUSES=["PENDING","APPROVED","REJECTED"];
const ci=(q)=>({contains:q,mode:"insensitive"});
const desc=(a,b)=>(b>a?1:b<a?-1:0);
const userCard={select:{publicId:true,name:true,phone:true,profileImage:true}};

function mapApplication(application){return{
  id:application.publicId,agencyName:application.agencyName,email:application.email,whatsapp:application.whatsapp,bdCode:application.bdCode,country:application.country,status:application.status,
  submittedAt:application.createdAt.toISOString(),updatedAt:application.updatedAt.toISOString(),reviewedAt:application.reviewedAt?.toISOString()??null,reviewNote:application.reviewNote,rejectionReason:application.rejectionReason,
  reviewedBy:application.reviewedBy?{name:application.reviewedBy.name,email:application.reviewedBy.email}:application.reviewedByUser?{name:application.reviewedByUser.name,email:`BD · ${application.reviewedByUser.publicId}`}:null,
  applicant:{id:application.user.publicId,name:application.user.name,phone:application.user.phone,profileImage:application.user.profileImage},
  cnicFrontUrl:application.cnicFrontMime?`/api/agencies/applications/${application.publicId}/cnic/front`:null,
  cnicBackUrl:application.cnicBackMime?`/api/agencies/applications/${application.publicId}/cnic/back`:null,
};}

/** Per-agency monthly settlement sums and host counts, for the given agency ids only. */
async function agencyStats(ids,monthStart){
  if(!ids.length) return {settlements:new Map(),hosts:new Map()};
  const [settlements,userHosts,talentHosts]=await Promise.all([
    prisma.giftSettlement.groupBy({by:["agencyId"],where:{agencyId:{in:ids},createdAt:{gte:monthStart}},_sum:{grossCoins:true,hostSalaryCoins:true,agencyCoins:true}}),
    prisma.user.groupBy({by:["agencyId"],where:{agencyId:{in:ids},deletedAt:null},_count:{_all:true}}),
    prisma.talent.groupBy({by:["agencyId"],where:{agencyId:{in:ids}},_count:{_all:true}}),
  ]);
  const hosts=new Map();
  for(const row of [...userHosts,...talentHosts]) hosts.set(row.agencyId,(hosts.get(row.agencyId)??0)+row._count._all);
  return {settlements:new Map(settlements.map((item)=>[item.agencyId,item._sum])),hosts};
}
function rankingRow(agency,stats){const gifts=stats.settlements.get(agency.id)?.grossCoins??0n;const target=agency.monthlyTargetCoins;const progress=target>0n?Number((gifts*10000n)/target)/100:0;return{id:agency.publicId,name:agency.name,status:agency.status,hosts:stats.hosts.get(agency.id)??0,gifts:gifts.toString(),target:target.toString(),progress};}
const agencySelect={id:true,publicId:true,name:true,status:true,monthlyTargetCoins:true};

async function loadOverview(monthStart){
  const userHostWhere={agencyId:{not:null},deletedAt:null};
  // Rankings: top 50 agencies by this month's gift coins (padded with newest agencies).
  const [topSettlements,totalAgencies,activeAgencies,userHostCount,talentHostCount,recharge,monthly,pendingApplications,pendingJoinRequests,topTalents,topUserGifts]=await Promise.all([
    prisma.giftSettlement.groupBy({by:["agencyId"],where:{agencyId:{not:null},createdAt:{gte:monthStart}},_sum:{grossCoins:true},orderBy:{_sum:{grossCoins:"desc"}},take:50}),
    prisma.agency.count(),
    prisma.agency.count({where:{status:"ACTIVE"}}),
    prisma.user.count({where:userHostWhere}),
    prisma.talent.count(),
    prisma.user.aggregate({where:userHostWhere,_sum:{totalTopUp:true}}),
    prisma.giftSettlement.aggregate({where:{agencyId:{not:null},createdAt:{gte:monthStart}},_sum:{grossCoins:true}}),
    prisma.agencyApplication.count({where:{status:"PENDING"}}),
    prisma.agencyJoinRequest.count({where:{status:"PENDING"}}),
    prisma.talent.findMany({select:{publicId:true,displayName:true,hostSalaryCoinBalance:true,totalGiftsValue:true,agency:{select:{name:true,publicId:true}}},orderBy:[{totalGiftsValue:"desc"},{id:"asc"}],take:10}),
    prisma.giftTransaction.groupBy({by:["recipientUserId"],where:{recipientUserId:{not:null},recipientUser:userHostWhere},_sum:{coinValue:true},orderBy:{_sum:{coinValue:"desc"}},take:10}),
  ]);
  const rankedIds=topSettlements.map((row)=>row.agencyId);
  const [rankedAgencies,padding,giftUsers]=await Promise.all([
    prisma.agency.findMany({where:{id:{in:rankedIds}},select:agencySelect}),
    rankedIds.length<50?prisma.agency.findMany({where:{id:{notIn:rankedIds}},select:agencySelect,orderBy:[{createdAt:"desc"},{id:"desc"}],take:50-rankedIds.length}):[],
    prisma.user.findMany({where:{...userHostWhere,id:{in:topUserGifts.map((row)=>row.recipientUserId)}},select:{id:true,publicId:true,name:true,hostSalaryCoinBalance:true,agency:{select:{name:true,publicId:true}}}}),
  ]);
  // Pad top hosts with highest-salary user hosts when few hosts have received gifts.
  const fillers=giftUsers.length<10?await prisma.user.findMany({where:{...userHostWhere,id:{notIn:giftUsers.map((user)=>user.id)}},select:{id:true,publicId:true,name:true,hostSalaryCoinBalance:true,agency:{select:{name:true,publicId:true}}},orderBy:[{hostSalaryCoinBalance:"desc"},{id:"asc"}],take:10-giftUsers.length}):[];
  const agencies=[...rankedAgencies,...padding];
  const stats=await agencyStats(agencies.map((agency)=>agency.id),monthStart);
  const rankings=agencies.map((agency)=>rankingRow(agency,stats)).sort((left,right)=>desc(BigInt(left.gifts),BigInt(right.gifts))).map((agency,index)=>({...agency,rank:index+1}));
  const giftsByUser=new Map(topUserGifts.map((item)=>[item.recipientUserId,item._sum.coinValue??0n]));
  const topHosts=[...[...giftUsers,...fillers].map((host)=>({id:host.publicId,name:host.name,agency:host.agency.name,agencyId:host.agency.publicId,salary:host.hostSalaryCoinBalance.toString(),gifts:(giftsByUser.get(host.id)??0n).toString(),kind:"User Host"})),...topTalents.map((host)=>({id:host.publicId,name:host.displayName,agency:host.agency.name,agencyId:host.agency.publicId,salary:host.hostSalaryCoinBalance.toString(),gifts:host.totalGiftsValue.toString(),kind:"Talent Host"}))].sort((left,right)=>desc(BigInt(left.gifts),BigInt(right.gifts))).slice(0,10).map((host,index)=>({...host,rank:index+1}));
  return {rankings,topHosts,totalAgencies,activeAgencies,totalHosts:userHostCount+talentHostCount,totalRecharge:(recharge._sum.totalTopUp??0n).toString(),monthlyGifts:(monthly._sum.grossCoins??0n).toString(),pendingApplications,pendingJoinRequests};
}

export default async function AgenciesPage({ searchParams }) {
  const admin = await requirePagePermission("agencies.view");
  const session = await auth();
  if (!session?.user) redirect("/");
  const params = (await searchParams) ?? {};
  const paging = readPaging(params);
  const tab = TABS.includes(params.tab) ? params.tab : TABS[0];
  const { q, skip, take } = paging;
  const monthStart=calendarWindow('month').start;
  let overview=null, applications=[], joinRequests=[], modules={tasks:[],monthlySalaries:[],hostSalaries:[]}, pageInfo=null;
  if(tab==="Agency Home"){
    overview=await loadOverview(monthStart);
  }else if(tab==="Agency Tasks"||tab==="Monthly Salary"){
    const where=q?{OR:[{publicId:ci(q)},{name:ci(q)}]}:{};
    const [rows,total]=await Promise.all([prisma.agency.findMany({where,select:agencySelect,orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take:take+1}),prisma.agency.count({where})]);
    const {items,hasNext}=splitPage(rows,take);
    const stats=await agencyStats(items.map((agency)=>agency.id),monthStart);
    modules.tasks=items.map((agency)=>{const row=rankingRow(agency,stats);return{agencyId:row.id,agency:row.name,target:row.target,achieved:row.gifts,progress:`${row.progress.toFixed(1)}%`,status:row.target==="0"?"Not set":row.progress>=100?"Achieved":"In progress"};});
    modules.monthlySalaries=items.map((agency)=>({agencyId:agency.publicId,agency:agency.name,hostSalary:(stats.settlements.get(agency.id)?.hostSalaryCoins??0n).toString(),agencyCommission:(stats.settlements.get(agency.id)?.agencyCoins??0n).toString(),status:agency.status}));
    pageInfo={page:paging.page,hasNext,total,label:"agencies",placeholder:"Search agency ID or name"};
  }else if(tab==="Host Salaries"){
    const kind=params.kind==="talent"?"talent":"user";
    if(kind==="talent"){
      const where=q?{OR:[{publicId:ci(q)},{displayName:ci(q)},{agency:{name:ci(q)}}]}:{};
      const [rows,total]=await Promise.all([prisma.talent.findMany({where,select:{publicId:true,displayName:true,hostSalaryCoinBalance:true,agency:{select:{name:true}}},orderBy:[{hostSalaryCoinBalance:"desc"},{id:"asc"}],skip,take:take+1}),prisma.talent.count({where})]);
      const {items,hasNext}=splitPage(rows,take);
      modules.hostSalaries=items.map((host)=>({hostId:host.publicId,host:host.displayName,agency:host.agency.name,type:"Talent Host",salaryBalance:host.hostSalaryCoinBalance.toString()}));
      pageInfo={page:paging.page,hasNext,total,label:"talent hosts",placeholder:"Search host ID, name or agency",kind};
    }else{
      const where={agencyId:{not:null},deletedAt:null,...(q?{OR:[{publicId:ci(q)},{name:ci(q)},{agency:{name:ci(q)}}]}:{})};
      const [rows,total]=await Promise.all([prisma.user.findMany({where,select:{publicId:true,name:true,hostSalaryCoinBalance:true,agency:{select:{name:true}}},orderBy:[{hostSalaryCoinBalance:"desc"},{id:"asc"}],skip,take:take+1}),prisma.user.count({where})]);
      const {items,hasNext}=splitPage(rows,take);
      modules.hostSalaries=items.map((host)=>({hostId:host.publicId,host:host.name,agency:host.agency.name,type:"User Host",salaryBalance:host.hostSalaryCoinBalance.toString()}));
      pageInfo={page:paging.page,hasNext,total,label:"user hosts",placeholder:"Search host ID, name or agency",kind};
    }
  }else if(tab==="Agency Apply"){
    const status=STATUSES.includes(params.status)?params.status:"ALL";
    const search=q?{OR:[{publicId:ci(q)},{agencyName:ci(q)},{email:ci(q)},{whatsapp:{contains:q}},{bdCode:ci(q)},{country:ci(q)},{user:{OR:[{publicId:ci(q)},{name:ci(q)},{phone:{contains:q}}]}}]}:{};
    const where={...search,...(status==="ALL"?{}:{status})};
    const [rows,total,allCount,pendingCount]=await Promise.all([prisma.agencyApplication.findMany({
      where,
      select:{publicId:true,agencyName:true,email:true,whatsapp:true,bdCode:true,country:true,status:true,createdAt:true,updatedAt:true,reviewedAt:true,cnicFrontMime:true,cnicBackMime:true,reviewNote:true,rejectionReason:true,reviewedBy:{select:{name:true,email:true}},reviewedByUser:{select:{name:true,publicId:true}},user:userCard},
      orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take:take+1,
    }),prisma.agencyApplication.count({where}),prisma.agencyApplication.count(),prisma.agencyApplication.count({where:{status:"PENDING"}})]);
    const {items,hasNext}=splitPage(rows,take);
    applications=items.map(mapApplication);
    pageInfo={page:paging.page,hasNext,total,label:"applications",placeholder:"Search agency, applicant, ID, phone…",status,allCount,pendingCount};
  }else if(tab==="Join Requests"){
    const where=q?{OR:[{publicId:ci(q)},{user:{OR:[{publicId:ci(q)},{name:ci(q)},{phone:{contains:q}}]}},{agency:{OR:[{publicId:ci(q)},{name:ci(q)}]}}]}:{};
    const [rows,total]=await Promise.all([prisma.agencyJoinRequest.findMany({where,select:{publicId:true,status:true,createdAt:true,updatedAt:true,reviewedAt:true,reviewNote:true,reviewedBy:{select:{name:true,email:true}},user:userCard,agency:{select:{publicId:true,name:true,status:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take:take+1}),prisma.agencyJoinRequest.count({where})]);
    const {items,hasNext}=splitPage(rows,take);
    joinRequests=items.map((request)=>({id:request.publicId,status:request.status,submittedAt:request.createdAt.toISOString(),updatedAt:request.updatedAt.toISOString(),reviewedAt:request.reviewedAt?.toISOString()??null,reviewNote:request.reviewNote,reviewedBy:request.reviewedBy,applicant:{id:request.user.publicId,name:request.user.name,phone:request.user.phone,profileImage:request.user.profileImage},agency:{id:request.agency.publicId,name:request.agency.name,status:request.agency.status}}));
    pageInfo={page:paging.page,hasNext,total,label:"join requests",placeholder:"Search applicant, agency or request ID"};
  }

  return (
    <main className="portal-ui min-h-screen bg-[#f4f8f7] text-[#142c2a]">
      <PortalSidebar />
      <section id="portal-content" tabIndex={-1} className="lg:pl-64">
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
        </header>{hasPermission(admin,"agencies.export")&&<div className="px-6"><DirectoryExport kind="agencies"/></div>}
        <div className="mx-auto max-w-7xl p-6 md:p-10">
          <div className="mb-7">
            <h2 className="text-2xl font-bold">Agency management</h2>
            <p className="mt-1.5 text-sm text-[#71847f]">
              Monitor agency rankings, host targets, tasks, applications, and
              salary activity.
            </p>
          </div>
          {hasPermission(admin, "agencies.create") && <CreateAgency />}
          <AgencyTabs active={tab} canManage={hasPermission(admin,"agencies.edit")} applications={applications} joinRequests={joinRequests} overview={overview} modules={modules} paging={pageInfo}/>
        </div>
      </section>
    </main>
  );
}
