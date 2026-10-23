import { requireEventUser } from "../../../lib/events/auth.js";
import { listEvents } from "../../../lib/events/service.js";
import EventTable from "../_components/event-table.js";
import RankingTemplate from "../_components/ranking-template.js";
import RankingRewards from "../_components/ranking-rewards.js";
import { prisma } from '../../../lib/prisma.js';
import { equippablePropCategories } from '../../../lib/props-store.js';
import { uploadLibraryFilter } from '../../../lib/upload-library-filter.js';

export default async function EventsPage() {
  const [user, events] = await Promise.all([requireEventUser(null), listEvents()]);
  const [policies,rounds,assets,tiers]=await Promise.all([
    prisma.rankingRewardPolicy.findMany({orderBy:[{effectiveFrom:'desc'},{createdAt:'desc'}]}),
    prisma.rankingRewardRound.findMany({orderBy:{createdAt:'desc'},take:30}),
    prisma.uploadAsset.findMany({where:{...uploadLibraryFilter,active:true,category:{in:[...equippablePropCategories]}},select:{id:true,name:true,category:true},orderBy:{name:'asc'}}),
    prisma.vipTier.findMany({where:{active:true},select:{id:true,name:true},orderBy:{level:'asc'}})
  ]);
  return <><h2 className="text-3xl font-black">Events</h2><p className="mt-1 text-slate-500">Search, publish, version, roll back, or remove hosted experiences.</p><RankingTemplate exists={events.some(event=>event.slug==='rankings')}/><RankingRewards events={events.map(e=>e.slug)} policies={JSON.parse(JSON.stringify(policies))} rounds={JSON.parse(JSON.stringify(rounds))} assets={assets} tiers={tiers} canEdit={user.role==='SUPER_ADMIN'}/><EventTable initialEvents={events} superAdmin={user.role === "SUPER_ADMIN"} /></>;
}
