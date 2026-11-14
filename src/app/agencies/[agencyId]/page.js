import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/portal-admin';
import { hasPermission } from '@/lib/portal-permissions';
import { prisma } from '@/lib/prisma';
import PortalSidebar from '../../components/portal-sidebar';
import SalaryPanel from '../salary-panel';
import AgencyReference from './reference';

export default async function AgencyDetail({ params }) {
  const admin = await requirePagePermission('agencies.view');
  const { agencyId } = await params;
  const agency = await prisma.agency.findUnique({where:{publicId:agencyId},select:{publicId:true,name:true,status:true,country:true,createdAt:true,owner:{select:{publicId:true,name:true}},bd:{select:{publicId:true,name:true}},userHosts:{where:{deletedAt:null},select:{publicId:true}},talents:{select:{publicId:true}},_count:{select:{joinRequests:{where:{status:'PENDING'}}}}}});
  if (!agency) notFound();
  const hosts = new Set([...agency.userHosts,...agency.talents].map(h=>h.publicId));
  return <main className="min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar/><section className="space-y-6 p-6 lg:ml-64 lg:p-10">
    <Link href="/agencies" className="text-sm text-teal-700 underline">← All agencies</Link>
    <header><h1 className="text-2xl font-bold">{agency.name}</h1><p className="text-sm text-slate-500">{agency.publicId} · {agency.status} · {agency.country || 'Country not set'}</p></header>
    <div className="grid gap-4 rounded-xl bg-white p-5 sm:grid-cols-4"><div><p className="text-sm text-slate-500">Current hosts</p><strong>{hosts.size}</strong></div><div><p className="text-sm text-slate-500">Pending join requests</p><Link href="/agencies" className="text-teal-700 underline">{agency._count.joinRequests} · Review in Join Requests</Link></div><div><p className="text-sm text-slate-500">Agency owner</p>{agency.owner ? <Link href={`/users/${encodeURIComponent(agency.owner.publicId)}`} className="text-teal-700 underline">{agency.owner.name} · {agency.owner.publicId}</Link> : 'Not assigned'}</div><div><p className="text-sm text-slate-500">Created</p>{agency.createdAt.toISOString().slice(0,10)}</div></div>
    <AgencyReference agencyId={agency.publicId} initial={agency.bd} canManage={hasPermission(admin,'agencies.edit')}/>
    <SalaryPanel agencies={[{agencyId:agency.publicId,agency:agency.name}]}/>
  </section></main>;
}
